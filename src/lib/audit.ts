import type { Prisma } from "@/generated/prisma/client";
import type { Db } from "./db-types";

// The audit_log table is append-only (a database trigger blocks edits and deletes).
export async function writeAudit(
  db: Db,
  entry: {
    userId?: number | null;
    tableName: string;
    recordId: string | number;
    action: string;
    oldValue?: Prisma.InputJsonValue;
    newValue?: Prisma.InputJsonValue;
  },
) {
  await db.auditLog.create({
    data: {
      userId: entry.userId ?? null,
      tableName: entry.tableName,
      recordId: String(entry.recordId),
      action: entry.action,
      oldValue: entry.oldValue,
      newValue: entry.newValue,
    },
  });
}
