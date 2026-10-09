// Shared helpers for database tests. Every test runs inside a transaction that is always
// rolled back, on the separate test branch (see vitest.setup.ts).
import bcrypt from "bcryptjs";
import { db } from "./db";
import type { Db } from "./db-types";

export class Rollback extends Error {}

export function assertTestDatabase() {
  if (process.env.TEST_DB_PROBLEM) throw new Error(process.env.TEST_DB_PROBLEM);
}

export async function inRollback(fn: (tx: Db) => Promise<void>) {
  try {
    await db.$transaction(
      async (tx) => {
        await fn(tx);
        throw new Rollback();
      },
      { timeout: 60_000, maxWait: 20_000 },
    );
  } catch (e) {
    if (!(e instanceof Rollback)) throw e;
  }
}

export async function makeRole(tx: Db, name: string, permissions: string[]) {
  for (const key of permissions) {
    await tx.permission.upsert({ where: { key }, update: {}, create: { key, description: key } });
  }
  return tx.role.create({
    data: { name, permissions: { create: permissions.map((permissionKey) => ({ permissionKey })) } },
  });
}

export async function makeUser(tx: Db, roleId: number, username: string, password = "right-password-1", extra = {}) {
  return tx.user.create({
    data: { username, name: username, roleId, passwordHash: await bcrypt.hash(password, 4), ...extra },
  });
}
