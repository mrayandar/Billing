import bcrypt from "bcryptjs";
import { writeAudit } from "./audit";
import type { Db } from "./db-types";
import { DEV_PASSWORD, LOGIN_LOCK_AFTER, LOGIN_LOCK_MINUTES } from "./permission-keys";

export type CurrentUser = {
  id: number;
  username: string;
  name: string;
  roleId: number;
  roleName: string;
  discountLimitBp: number;
  permissions: Set<string>;
  mustChangePassword: boolean;
};

export type LoginResult =
  | { ok: true; userId: number }
  | { ok: false; reason: "invalid" | "locked" | "inactive"; lockedUntil?: Date };

// Loads the user fresh from the database, so a role change or a switched-off account
// applies on the very next request. Returns null when the user is missing or inactive.
export async function loadUser(db: Db, id: number): Promise<CurrentUser | null> {
  const u = await db.user.findUnique({
    where: { id },
    include: { role: { include: { permissions: true } } },
  });
  if (!u || !u.active) return null;
  return {
    id: u.id,
    username: u.username,
    name: u.name,
    roleId: u.roleId,
    roleName: u.role.name,
    discountLimitBp: u.role.discountLimitBp,
    permissions: new Set(u.role.permissions.map((p) => p.permissionKey)),
    mustChangePassword: u.mustChangePassword,
  };
}

export function can(user: Pick<CurrentUser, "permissions">, permission: string): boolean {
  return user.permissions.has(permission);
}

export function passwordProblem(password: string): string | null {
  if (password.length < 8) return "The new password must be at least 8 characters.";
  if (password === DEV_PASSWORD) return "Choose a different password from the sample one.";
  return null;
}

export async function authenticate(
  db: Db,
  username: string,
  password: string,
  now: Date = new Date(),
): Promise<LoginResult> {
  const user = await db.user.findUnique({ where: { username: username.trim().toLowerCase() } });
  if (!user) {
    await writeAudit(db, { tableName: "users", recordId: username.trim(), action: "login_failed_unknown_user" });
    return { ok: false, reason: "invalid" };
  }
  if (user.lockedUntil && user.lockedUntil > now) {
    await writeAudit(db, { userId: user.id, tableName: "users", recordId: user.id, action: "login_blocked_locked" });
    return { ok: false, reason: "locked", lockedUntil: user.lockedUntil };
  }

  const passwordOk = await bcrypt.compare(password, user.passwordHash);
  if (!passwordOk) {
    const failed = user.failedLogins + 1;
    const lock = failed >= LOGIN_LOCK_AFTER;
    await db.user.update({
      where: { id: user.id },
      data: {
        failedLogins: lock ? 0 : failed,
        lockedUntil: lock ? new Date(now.getTime() + LOGIN_LOCK_MINUTES * 60_000) : user.lockedUntil,
      },
    });
    await writeAudit(db, {
      userId: user.id,
      tableName: "users",
      recordId: user.id,
      action: lock ? "login_failed_locked" : "login_failed",
    });
    return lock
      ? { ok: false, reason: "locked", lockedUntil: new Date(now.getTime() + LOGIN_LOCK_MINUTES * 60_000) }
      : { ok: false, reason: "invalid" };
  }

  // Correct password. A switched-off account never gets in.
  if (!user.active) {
    await writeAudit(db, { userId: user.id, tableName: "users", recordId: user.id, action: "login_blocked_inactive" });
    return { ok: false, reason: "inactive" };
  }
  await db.user.update({ where: { id: user.id }, data: { failedLogins: 0, lockedUntil: null } });
  await writeAudit(db, { userId: user.id, tableName: "users", recordId: user.id, action: "login" });
  return { ok: true, userId: user.id };
}

// The user sets their own new password (also clears the "must change" flag).
export async function changeOwnPassword(db: Db, userId: number, current: string, next: string) {
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user || !(await bcrypt.compare(current, user.passwordHash))) {
    return { ok: false as const, error: "Your current password is not correct." };
  }
  const problem = passwordProblem(next);
  if (problem) return { ok: false as const, error: problem };
  if (await bcrypt.compare(next, user.passwordHash)) {
    return { ok: false as const, error: "The new password must be different from the current one." };
  }
  await db.user.update({
    where: { id: userId },
    data: { passwordHash: await bcrypt.hash(next, 10), mustChangePassword: false },
  });
  await writeAudit(db, { userId, tableName: "users", recordId: userId, action: "password_changed" });
  return { ok: true as const };
}

// US-04: check a manager's or owner's username and password for an approval on the spot.
// Needs the given permission; the approver is returned so the caller can log who approved.
export async function verifyApprover(db: Db, username: string, password: string, permission: string) {
  const user = await db.user.findUnique({ where: { username: username.trim().toLowerCase() } });
  if (!user || !user.active || !(await bcrypt.compare(password, user.passwordHash))) return null;
  const loaded = await loadUser(db, user.id);
  if (!loaded || !can(loaded, permission)) return null;
  return loaded;
}
