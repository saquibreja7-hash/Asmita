// TEMPORARY, not committed: TCP proxy for the local E2E run only.
// The Playwright E2E suite must reach its throwaway Postgres at
// 127.0.0.1:5433 from inside the n22 container (tests/e2e/support/database.ts
// refuses any other host), so this forwards container-loopback:5433 to the
// Postgres container.
import net from "node:net";

const host = process.env.E2E_PG_PROXY_HOST ?? "172.17.0.3";
const port = Number(process.env.E2E_PG_PROXY_PORT ?? 5432);

const server = net.createServer((socket) => {
  const upstream = net.connect(port, host);
  socket.pipe(upstream);
  upstream.pipe(socket);
  const drop = () => {
    socket.destroy();
    upstream.destroy();
  };
  socket.on("error", drop);
  upstream.on("error", drop);
  socket.on("close", () => upstream.destroy());
  upstream.on("close", () => socket.destroy());
});

server.listen(5433, "127.0.0.1", () => {
  console.log(`e2e pg proxy: 127.0.0.1:5433 -> ${host}:${port}`);
});
