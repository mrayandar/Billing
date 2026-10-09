import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

// One shared database connection for the whole app (avoids opening a new one on every dev reload).
const globalForDb = globalThis as unknown as { db?: PrismaClient };

export const db =
  globalForDb.db ??
  new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });

if (process.env.NODE_ENV !== "production") globalForDb.db = db;

// Run several writes as one all-or-nothing unit (a failed step undoes the others).
export function transact<T>(fn: (tx: Parameters<Parameters<typeof db.$transaction>[0]>[0]) => Promise<T>) {
  return db.$transaction(fn, { timeout: 30_000, maxWait: 15_000 });
}
