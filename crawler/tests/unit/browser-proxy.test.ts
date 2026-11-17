/**
 * The in-process SOCKS5 proxy for browser traffic (WP7), unit-tested against
 * a raw client socket: the address policy decides every tunnel, refusals
 * are counted by code, and the per-render byte account destroys tunnels that
 * exceed it. The policy here is the test one; the production blocklist is
 * exercised too (a hostname resolving to a private address is refused).
 */
import net from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ErrorCode } from "../../src/errors.ts";
import { BrowserProxy } from "../../src/net/browser-proxy.ts";
import { loopbackTestPolicy } from "../support/test-policy.ts";

let echo: net.Server;
let echoPort = 0;
const refusals: ErrorCode[] = [];
let proxy: BrowserProxy;
let proxyPort = 0;

beforeAll(async () => {
  echo = net.createServer((socket) => {
    socket.pipe(socket);
  });
  await new Promise<void>((r) => echo.listen(0, "127.0.0.1", r));
  echoPort = (echo.address() as net.AddressInfo).port;
  proxy = new BrowserProxy(loopbackTestPolicy(["target.test"], echoPort), {
    maxBytes: 1024 * 1024,
    connectTimeoutMs: 3000,
    onRefusal: (code) => refusals.push(code),
  });
  proxyPort = await proxy.start();
  // Tunnels exist only inside a render's account (as during a real render).
  proxy.beginAccount(1024 * 1024, () => undefined);
}, 20_000);

afterAll(async () => {
  await proxy?.stop();
  await new Promise<void>((r) => echo.close(() => r()));
  (echo as unknown as { closeAllConnections?: () => void }).closeAllConnections?.();
});

type SocksResult = { rep: number; socket: net.Socket | null };

/** Minimal SOCKS5 client: greet, CONNECT, return the reply code. */
function socksConnect(
  hostType: 1 | 3 | 4,
  host: string,
  port: number,
  command = 0x01,
): Promise<SocksResult> {
  return new Promise((resolve, reject) => {
    const socket = net.connect(proxyPort, "127.0.0.1");
    socket.setTimeout(4000, () => {
      socket.destroy();
      reject(new Error("socks timeout"));
    });
    socket.on("error", reject);
    socket.once("data", (greetingReply: Buffer) => {
      if (greetingReply[0] !== 5 || greetingReply[1] !== 0) {
        socket.destroy();
        return resolve({ rep: greetingReply[1] ?? -1, socket: null });
      }
      const hostBuf =
        hostType === 1
          ? Buffer.from(host.split(".").map(Number))
          : hostType === 3
            ? Buffer.concat([Buffer.from([Buffer.byteLength(host)]), Buffer.from(host, "latin1")])
            : Buffer.from(host, "latin1");
      const req = Buffer.concat([
        Buffer.from([5, command, 0, hostType]),
        hostBuf,
        (() => {
          const p = Buffer.alloc(2);
          p.writeUInt16BE(port);
          return p;
        })(),
      ]);
      socket.write(req);
      socket.once("data", (reply: Buffer) => {
        if (reply[1] !== 0) {
          socket.destroy();
          return resolve({ rep: reply[1]!, socket: null });
        }
        resolve({ rep: 0, socket });
      });
    });
    socket.write(Buffer.from([5, 1, 0])); // greet: no-auth
  });
}

function roundTrip(socket: net.Socket, payload: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const done = setTimeout(() => reject(new Error("echo timeout")), 4000);
    socket.on("data", (c: Buffer) => {
      chunks.push(c);
      if (Buffer.concat(chunks).toString("utf8").length >= payload.length) {
        clearTimeout(done);
        resolve(Buffer.concat(chunks).toString("utf8"));
      }
    });
    socket.write(payload);
  });
}

describe("browser proxy (SOCKS5)", () => {
  it("tunnels an allowed host through the validated address", async () => {
    const { rep, socket } = await socksConnect(3, "target.test", echoPort);
    expect(rep).toBe(0);
    expect(await roundTrip(socket!, "hello-through-the-tunnel")).toBe("hello-through-the-tunnel");
    socket!.destroy();
  });

  it("refuses a private literal address (ATYP 1)", async () => {
    const { rep, socket } = await socksConnect(1, "10.0.0.1", 80);
    expect(rep).toBe(2);
    expect(socket).toBeNull();
    expect(refusals).toContain("blocked_address");
  });

  it("refuses a private address Chromium sends as a domain (ATYP 3)", async () => {
    const { rep } = await socksConnect(3, "10.0.0.1", 80);
    expect(rep).toBe(2);
  });

  it("refuses a hostname that resolves to a private address", async () => {
    // extraDns maps this name to a metadata address; the production
    // blocklist refuses it even though the test resolver answered.
    const p = new BrowserProxy(loopbackTestPolicy(["target.test"], echoPort, { "metadata.test": ["169.254.169.254"] }), {
      maxBytes: 1024 * 1024,
      connectTimeoutMs: 3000,
    });
    const port = await p.start();
    // An active render, so the refusal below is the address policy's.
    p.beginAccount(1024 * 1024, () => undefined);
    await new Promise<void>((resolve, reject) => {
      const socket = net.connect(port, "127.0.0.1");
      socket.on("error", reject);
      socket.write(Buffer.from([5, 1, 0]));
      socket.once("data", () => {
        socket.write(Buffer.concat([Buffer.from([5, 1, 0, 3]), Buffer.from([13]), Buffer.from("metadata.test", "latin1"), Buffer.from([0, 80])]));
        socket.once("data", (reply: Buffer) => {
          expect(reply[1]).toBe(2);
          socket.destroy();
          resolve();
        });
      });
    });
    await p.stop();
  });

  it("refuses a port the policy does not allow", async () => {
    const { rep } = await socksConnect(3, "target.test", 1234);
    expect(rep).toBe(2);
    expect(refusals).toContain("blocked_port");
  });

  it("refuses an unsupported command (BIND)", async () => {
    const { rep } = await socksConnect(3, "target.test", echoPort, 0x02);
    expect(rep).toBe(7);
  });

  it("rejects a greeting without the no-auth method", async () => {
    await new Promise<void>((resolve, reject) => {
      const socket = net.connect(proxyPort, "127.0.0.1");
      socket.on("error", reject);
      socket.write(Buffer.from([5, 1, 0xff]));
      socket.once("data", (reply: Buffer) => {
        // No acceptable method: 0xff, then closed.
        expect(reply[1]).toBe(0xff);
        socket.once("close", () => resolve());
      });
    });
  });

  it("destroys tunnels when the render's byte budget is exceeded", async () => {
    const p = new BrowserProxy(loopbackTestPolicy(["target.test"], echoPort), {
      maxBytes: 200,
      connectTimeoutMs: 3000,
    });
    await p.start();
    let over = 0;
    p.beginAccount(200, () => {
      over += 1;
    });
    const socket = await new Promise<net.Socket>((resolve, reject) => {
      const s = net.connect(p.listenPort, "127.0.0.1");
      s.on("error", reject);
      s.write(Buffer.from([5, 1, 0]));
      s.once("data", () => {
        s.write(Buffer.concat([Buffer.from([5, 1, 0, 3]), Buffer.from([Buffer.from("target.test").length]), Buffer.from("target.test"), Buffer.from([(echoPort >> 8) & 0xff, echoPort & 0xff])]));
        s.once("data", (reply: Buffer) => {
          if (reply[1] !== 0) return reject(new Error("tunnel refused"));
          resolve(s);
        });
      });
    });
    const closed = new Promise<void>((resolve) => socket.on("close", () => resolve()));
    socket.write("x".repeat(400)); // over the 200-byte account
    await closed;
    expect(over).toBe(1);
    p.endAccount();
    await p.stop();
  });

  it("refuses a tunnel while no render account is active", async () => {
    const seen: ErrorCode[] = [];
    const p = new BrowserProxy(loopbackTestPolicy(["target.test"], echoPort), {
      maxBytes: 1024 * 1024,
      connectTimeoutMs: 3000,
      onRefusal: (code) => seen.push(code),
    });
    await p.start();
    try {
      // Before any render, and again after one has ended.
      expect((await connectVia(p.listenPort, "target.test", echoPort)).rep).toBe(2);
      p.beginAccount(1024 * 1024, () => undefined);
      const open = await connectVia(p.listenPort, "target.test", echoPort);
      expect(open.rep).toBe(0);
      open.socket!.destroy();
      p.endAccount();
      expect((await connectVia(p.listenPort, "target.test", echoPort)).rep).toBe(2);
      expect(seen.filter((c) => c === "browser_no_render")).toHaveLength(2);
    } finally {
      await p.stop();
    }
  });

  it("tears down a render's tunnels when its account ends", async () => {
    const p = new BrowserProxy(loopbackTestPolicy(["target.test"], echoPort), { maxBytes: 1024 * 1024, connectTimeoutMs: 3000 });
    await p.start();
    try {
      p.beginAccount(1024 * 1024, () => undefined);
      const { rep, socket } = await connectVia(p.listenPort, "target.test", echoPort);
      expect(rep).toBe(0);
      const closed = new Promise<void>((resolve) => socket!.on("close", () => resolve()));
      p.endAccount();
      await closed;
    } finally {
      await p.stop();
    }
  });

  it("keeps an established tunnel past the handshake timeout", async () => {
    const p = new BrowserProxy(loopbackTestPolicy(["target.test"], echoPort), {
      maxBytes: 1024 * 1024,
      connectTimeoutMs: 3000,
      handshakeTimeoutMs: 150,
    });
    await p.start();
    try {
      p.beginAccount(1024 * 1024, () => undefined);
      const { rep, socket } = await connectVia(p.listenPort, "target.test", echoPort);
      expect(rep).toBe(0);
      await new Promise((r) => setTimeout(r, 450));
      expect(socket!.destroyed).toBe(false);
      expect(await roundTrip(socket!, "still-open")).toBe("still-open");
      socket!.destroy();
    } finally {
      await p.stop();
    }
  });
});

/** SOCKS5 CONNECT (domain type) to a given proxy port; the reply code and, on success, the socket. */
function connectVia(port: number, host: string, target: number): Promise<SocksResult> {
  return new Promise((resolve, reject) => {
    const s = net.connect(port, "127.0.0.1");
    s.on("error", reject);
    s.write(Buffer.from([5, 1, 0]));
    s.once("data", () => {
      const name = Buffer.from(host, "latin1");
      s.write(Buffer.concat([Buffer.from([5, 1, 0, 3, name.length]), name, Buffer.from([(target >> 8) & 0xff, target & 0xff])]));
      s.once("data", (reply: Buffer) => {
        if (reply[1] !== 0) {
          s.destroy();
          return resolve({ rep: reply[1]!, socket: null });
        }
        resolve({ rep: 0, socket: s });
      });
    });
  });
}
