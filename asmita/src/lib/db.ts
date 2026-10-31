import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { PrismaClient as EdgePrismaClient } from "@prisma/client/edge";
import { requestScope } from "@/lib/request-scope";
import { usesWorkerPostgres } from "@/lib/worker-postgres";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

function createClient(Client: typeof PrismaClient) {
  return new Client({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
}

export function getDb() {
  if (usesWorkerPostgres()) {
    // On Workers: the edge build loads Prisma's query engine as a precompiled
    // WebAssembly module (Workers forbid compiling one at runtime, which the
    // Node build does), and each request gets its own client because Workers
    // forbid reusing another request's connection.
    const Client = EdgePrismaClient as unknown as typeof PrismaClient;
    const scope = requestScope.getStore();
    if (!scope) return createClient(Client);
    let client = scope.get("prisma") as PrismaClient | undefined;
    if (!client) {
      client = createClient(Client);
      scope.set("prisma", client);
    }
    return client;
  }
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = createClient(PrismaClient);
  }
  return globalForPrisma.prisma;
}

export const db = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    return Reflect.get(getDb(), prop);
  },
});
