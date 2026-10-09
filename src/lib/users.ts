import bcrypt from "bcryptjs";
import { writeAudit } from "./audit";
import { passwordProblem } from "./auth-core";
import type { Db } from "./db-types";
import { OWNER_ROLE } from "./permission-keys";

type Result = { ok: true } | { ok: false; error: string };
const fail = (error: string): Result => ({ ok: false, error });

async function activeOwnerCount(db: Db, exceptUserId?: number) {
  return db.user.count({
    where: { active: true, role: { name: OWNER_ROLE }, ...(exceptUserId ? { id: { not: exceptUserId } } : {}) },
  });
}

export async function createUser(
  db: Db,
  actorId: number,
  input: { username: string; name: string; roleId: number; password: string },
): Promise<Result> {
  const username = input.username.trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,30}$/.test(username)) return fail("Username: 3-30 letters, numbers, dot, dash or underscore.");
  if (!input.name.trim()) return fail("Enter the person's name.");
  const problem = passwordProblem(input.password);
  if (problem) return fail(problem);
  if (await db.user.findUnique({ where: { username } })) return fail("That username is already taken.");
  if (!(await db.role.findUnique({ where: { id: input.roleId } }))) return fail("Choose a role.");

  const user = await db.user.create({
    data: {
      username,
      name: input.name.trim(),
      roleId: input.roleId,
      passwordHash: await bcrypt.hash(input.password, 10),
      mustChangePassword: true,
    },
  });
  await writeAudit(db, {
    userId: actorId,
    tableName: "users",
    recordId: user.id,
    action: "create",
    newValue: { username, name: user.name, roleId: user.roleId },
  });
  return { ok: true };
}

export async function changeRole(db: Db, actorId: number, userId: number, roleId: number): Promise<Result> {
  const user = await db.user.findUnique({ where: { id: userId }, include: { role: true } });
  const role = await db.role.findUnique({ where: { id: roleId } });
  if (!user || !role) return fail("User or role not found.");
  if (user.role.name === OWNER_ROLE && role.name !== OWNER_ROLE && user.active && (await activeOwnerCount(db, userId)) === 0) {
    return fail("There must always be at least one active owner.");
  }
  await db.user.update({ where: { id: userId }, data: { roleId } });
  await writeAudit(db, {
    userId: actorId,
    tableName: "users",
    recordId: userId,
    action: "role_changed",
    oldValue: { role: user.role.name },
    newValue: { role: role.name },
  });
  return { ok: true };
}

export async function setActive(db: Db, actorId: number, userId: number, active: boolean): Promise<Result> {
  const user = await db.user.findUnique({ where: { id: userId }, include: { role: true } });
  if (!user) return fail("User not found.");
  if (!active) {
    if (userId === actorId && user.role.name === OWNER_ROLE) return fail("The owner cannot switch off their own account.");
    if (user.role.name === OWNER_ROLE && user.active && (await activeOwnerCount(db, userId)) === 0) {
      return fail("There must always be at least one active owner.");
    }
  }
  await db.user.update({ where: { id: userId }, data: { active } });
  await writeAudit(db, {
    userId: actorId,
    tableName: "users",
    recordId: userId,
    action: active ? "activated" : "deactivated",
    oldValue: { active: user.active },
    newValue: { active },
  });
  return { ok: true };
}

// Owner sets a temporary password; the person must choose their own at next login.
export async function resetPassword(db: Db, actorId: number, userId: number, temporary: string): Promise<Result> {
  const problem = passwordProblem(temporary);
  if (problem) return fail(problem);
  if (!(await db.user.findUnique({ where: { id: userId } }))) return fail("User not found.");
  await db.user.update({
    where: { id: userId },
    data: { passwordHash: await bcrypt.hash(temporary, 10), mustChangePassword: true, failedLogins: 0, lockedUntil: null },
  });
  await writeAudit(db, { userId: actorId, tableName: "users", recordId: userId, action: "password_reset" });
  return { ok: true };
}

export async function unlockUser(db: Db, actorId: number, userId: number): Promise<Result> {
  if (!(await db.user.findUnique({ where: { id: userId } }))) return fail("User not found.");
  await db.user.update({ where: { id: userId }, data: { failedLogins: 0, lockedUntil: null } });
  await writeAudit(db, { userId: actorId, tableName: "users", recordId: userId, action: "unlocked" });
  return { ok: true };
}
