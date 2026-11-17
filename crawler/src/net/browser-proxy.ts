/**
 * The in-process forward proxy for browser traffic (crawler v2 WP7).
 *
 * Every byte Chromium sends leaves through this SOCKS5 server, and it applies
 * the same address policy as safe-fetch before any connection is made: the
 * target port must be allowed by the NetPolicy, the hostname is resolved
 * through the policy's resolver (ALL addresses checked, any blocked one
 * refuses the connection) and the socket is dialed to the validated address
 * literal — the address that is checked is the address that is connected, so
 * there is no rebinding window. A hostname that is really a literal IP
 * (Chromium sends literal destinations as domain-type strings) is checked
 * directly against the address policy. Nothing here can loosen the policy:
 * the object is the same one safe-fetch uses, and production builds it only
 * through productionPolicy().
 *
 * Socks5 rather than an HTTP proxy on purpose: with a SOCKS proxy Chromium
 * hands the proxy the HOSTNAME (remote DNS) instead of resolving it itself,
 * so the proxy sees every destination before it is contacted and no
 * absolute-URI HTTP parsing is needed. The browser is launched with
 * --proxy-bypass-list=<-loopback> so even loopback destinations go through
 * the proxy (and are then refused by the policy in production).
 *
 * Per page render the parent sets an "account": a byte budget on the sum of
 * all tunnel traffic. When it is exceeded the account's tunnels are
 * destroyed, the render is aborted, and the page is reported as an error
 * (a hostile page cannot stream forever). Time caps bound it too.
 */
import net from "node:net";
import { isIP } from "node:net";
import type { ErrorCode } from "../errors.ts";
import { bareHost, resolveAllowed, type NetPolicy } from "./policy.ts";

const SOCKS_VERSION = 5;
/** No-auth is the only acceptable method. */
const METHOD_NO_AUTH = 0x00;
const REP_OK = 0x00;
const REP_NOT_ALLOWED = 0x02;
const REP_CMD_UNSUPPORTED = 0x07;
const REP_ATYP_UNSUPPORTED = 0x08;
/** VER REP RSV ATYP BND.ADDR(4) BND.PORT(2) */
const REPLY_LEN = 10;

/** Idle pre-handshake timeout: a socket that never speaks is dropped. */
const HANDSHAKE_TIMEOUT_MS = 30_000;

export type BrowserProxyOptions = {
  /** Total bytes one page render may move through all its tunnels. */
  maxBytes: number;
  /** Connect deadline for the upstream socket. */
  connectTimeoutMs: number;
  /** Refusal / failure counter (codes only, never hostnames). */
  onRefusal?: (code: ErrorCode) => void;
};

type Account = {
  maxBytes: number;
  total: number;
  over: boolean;
  sockets: Set<net.Socket>;
  onOver: () => void;
};

export class BrowserProxy {
  private server: net.Server | null = null;
  private port = 0;
  private account: Account | null = null;
  /** Every live client socket (for stop()). */
  private readonly sockets = new Set<net.Socket>();

  constructor(
    private readonly policy: NetPolicy,
    private readonly opts: BrowserProxyOptions,
  ) {}

  /** Start listening on an ephemeral loopback port; returns the port. */
  async start(): Promise<number> {
    if (this.server) return this.port;
    const server = net.createServer((socket) => void this.onConnection(socket));
    server.on("error", () => undefined);
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", () => resolve());
    });
    this.server = server;
    const addr = server.address();
    this.port = typeof addr === "object" && addr !== null ? addr.port : 0;
    return this.port;
  }

  get listenPort(): number {
    return this.port;
  }

  /** Begin the per-render byte account (renders are serialised). */
  beginAccount(maxBytes: number, onOver: () => void): void {
    this.endAccount();
    this.account = { maxBytes, total: 0, over: false, sockets: new Set(), onOver };
  }

  endAccount(): void {
    this.account = null;
  }

  async stop(): Promise<void> {
    const server = this.server;
    this.server = null;
    if (!server) return;
    for (const socket of [...this.sockets]) socket.destroy();
    this.sockets.clear();
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
      (server as unknown as { closeAllConnections?: () => void }).closeAllConnections?.();
    });
  }

  // --- SOCKS5 ---------------------------------------------------------------

  private onConnection(socket: net.Socket): void {
    this.sockets.add(socket);
    socket.on("close", () => this.sockets.delete(socket));
    socket.setTimeout(HANDSHAKE_TIMEOUT_MS, () => socket.destroy());
    socket.on("error", () => socket.destroy());
    socket.once("data", (greeting: Buffer) => {
      if (greeting.length < 2 || greeting[0] !== SOCKS_VERSION) return void socket.destroy();
      const n = greeting[1]!;
      if (greeting.length < 2 + n || n < 1 || !greeting.subarray(2, 2 + n).includes(METHOD_NO_AUTH)) {
        socket.write(Buffer.from([SOCKS_VERSION, 0xff]), () => socket.destroy());
        return;
      }
      socket.write(Buffer.from([SOCKS_VERSION, METHOD_NO_AUTH]), () => undefined);
      socket.once("data", (req: Buffer) => void this.onRequest(socket, req));
    });
  }

  private onRequest(socket: net.Socket, req: Buffer): void {
    if (req.length < 8 || req[0] !== SOCKS_VERSION) return void socket.destroy();
    const cmd = req[1]!;
    if (cmd !== 0x01) {
      this.opts.onRefusal?.("browser_protocol");
      return void this.replyAndClose(socket, REP_CMD_UNSUPPORTED);
    }
    const atyp = req[3]!;
    let host: string;
    let off = 4;
    if (atyp === 0x01) {
      if (req.length < off + 6) return void socket.destroy();
      host = [...req.subarray(off, off + 4)].map((b) => String(b)).join(".");
      off += 4;
    } else if (atyp === 0x03) {
      const len = req[off]!;
      if (req.length < off + 1 + len + 2) return void socket.destroy();
      host = req.subarray(off + 1, off + 1 + len).toString("latin1");
      off += 1 + len;
    } else if (atyp === 0x04) {
      if (req.length < off + 18) return void socket.destroy();
      host = formatIpv6(req.subarray(off, off + 16));
      off += 16;
    } else {
      this.opts.onRefusal?.("browser_protocol");
      return void this.replyAndClose(socket, REP_ATYP_UNSUPPORTED);
    }
    const port = req.readUInt16BE(off);

    // Port rule: same policy as safe-fetch, checked for both schemes (the
    // SOCKS handshake carries no scheme; 443 is https, 80 is http, and the
    // policy decides anything else).
    const portAllowed = this.policy.isPortAllowed(port, "https:") || this.policy.isPortAllowed(port, "http:");
    if (!portAllowed) {
      this.opts.onRefusal?.("blocked_port");
      return void this.replyAndClose(socket, REP_NOT_ALLOWED);
    }

    // Address rule: literals are checked directly; names go through the
    // policy resolver, which rejects when ANY resolved address is blocked.
    let address: string;
    const name = bareHost(host);
    const literal = isIP(name);
    if (literal !== 0) {
      if (!this.policy.isAddressAllowed(name)) {
        this.opts.onRefusal?.("blocked_address");
        return void this.replyAndClose(socket, REP_NOT_ALLOWED);
      }
      address = name;
    } else {
      void resolveAllowed(name, this.policy).then(
        (resolved) => void this.connect(socket, resolved.address, port),
        (err: unknown) => {
          this.opts.onRefusal?.(codeOf(err));
          this.replyAndClose(socket, REP_NOT_ALLOWED);
        },
      );
      return;
    }
    void this.connect(socket, address, port);
  }

  private connect(socket: net.Socket, address: string, port: number): void {
    if (socket.destroyed) return;
    const account = this.account;
    const upstream = net.connect({ host: address, port });
    const timer = setTimeout(() => {
      upstream.destroy();
      this.opts.onRefusal?.("connect_timeout");
      this.replyAndClose(socket, REP_NOT_ALLOWED);
    }, this.opts.connectTimeoutMs);
    upstream.on("error", () => {
      clearTimeout(timer);
      upstream.destroy();
      this.opts.onRefusal?.("connect_failed");
      this.replyAndClose(socket, REP_NOT_ALLOWED);
    });
    upstream.on("connect", () => {
      clearTimeout(timer);
      if (socket.destroyed) return void upstream.destroy();
      // Success reply keeps the socket open: the tunnel starts here.
      const reply = Buffer.alloc(REPLY_LEN);
      reply[0] = SOCKS_VERSION;
      reply[1] = REP_OK;
      reply[3] = 0x01;
      socket.write(reply);
      if (socket.destroyed) return void upstream.destroy();
      // Tunnel established: relay both ways, counting bytes into the
      // account, honouring backpressure so a stalled reader cannot buffer
      // without bound. No further SOCKS parsing happens on this socket.
      account?.sockets.add(socket);
      const pump = (from: net.Socket, to: net.Socket) => {
        from.on("data", (chunk: Buffer) => {
          if (account && !account.over) {
            account.total += chunk.length;
            if (account.total > account.maxBytes) {
              account.over = true;
              for (const s of [...account.sockets]) s.destroy();
              account.sockets.clear();
              account.onOver();
              return;
            }
          }
          if (!to.write(chunk)) from.pause();
        });
        to.on("drain", () => from.resume());
      };
      pump(socket, upstream);
      pump(upstream, socket);
      const drop = () => {
        socket.destroy();
        upstream.destroy();
      };
      socket.on("close", drop);
      upstream.on("close", drop);
    });
  }

  private replyAndClose(socket: net.Socket, rep: number): void {
    const reply = Buffer.alloc(REPLY_LEN);
    reply[0] = SOCKS_VERSION;
    reply[1] = rep;
    reply[3] = 0x01; // BND.ADDR 0.0.0.0
    socket.write(reply, () => {
      // Refused: close promptly so the client does not wait on the tunnel.
      socket.end();
      setTimeout(() => socket.destroy(), 250).unref?.();
    });
  }
}

function formatIpv6(bytes: Buffer): string {
  const parts: string[] = [];
  for (let i = 0; i < 16; i += 2) parts.push(bytes.subarray(i, i + 2).toString("hex"));
  // Full form; the policy parser handles any valid textual form.
  return parts.join(":");
}

function codeOf(err: unknown): ErrorCode {
  const code = (err as { code?: unknown } | null)?.code;
  return code === "blocked_address" ? "blocked_address" : code === "invalid_url" ? "invalid_url" : "dns_failed";
}
