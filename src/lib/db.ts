import { PrismaClient } from "@prisma/client";

const CLOSED_CONNECTION_PATTERNS = [
  "error in postgresql connection",
  "kind: closed",
  "server closed the connection",
  "connection terminated unexpectedly"
];

function isClosedConnectionError(error: unknown): error is Error {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return CLOSED_CONNECTION_PATTERNS.some((pattern) => message.includes(pattern));
}

function createPrismaClient() {
  const client = new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"]
  });

  return client.$extends({
    name: "retry-on-closed-connection",
    query: {
      async $allOperations({ args, query }) {
        try {
          return await query(args);
        } catch (error) {
          if (!isClosedConnectionError(error)) {
            throw error;
          }

          await client.$disconnect().catch(() => undefined);
          await client.$connect();
          return query(args);
        }
      }
    }
  });
}

type PrismaClientWithRetry = ReturnType<typeof createPrismaClient>;

declare global {
  // eslint-disable-next-line no-var
  var prismaGlobal: PrismaClientWithRetry | undefined;
}

export const db =
  global.prismaGlobal ??
  createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  global.prismaGlobal = db;
}
