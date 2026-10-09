import type { Prisma, PrismaClient } from "@/generated/prisma/client";

// Services accept either the shared client or a transaction, so tests can roll everything back.
export type Db = PrismaClient | Prisma.TransactionClient;
