// These tests run against the development database inside a transaction that is always
// rolled back, so they leave no users and no audit rows behind.
import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { authenticate, can, changeOwnPassword, loadUser, verifyApprover } from "./auth-core";
import { db } from "./db";
import type { Db } from "./db-types";
import { DEV_PASSWORD, LOGIN_LOCK_AFTER } from "./permission-keys";
import { assertTestDatabase, inRollback, makeRole, makeUser } from "./test-helpers";
import { changeRole, createUser, resetPassword, setActive, unlockUser } from "./users";

beforeAll(assertTestDatabase);

afterAll(() => db.$disconnect());

describe("login", () => {
  it("accepts the right password and records the login", async () => {
    await inRollback(async (tx) => {
      const role = await makeRole(tx, "T-cashier", ["billing.create"]);
      const user = await makeUser(tx, role.id, "t_ali");
      const result = await authenticate(tx, "T_Ali", "right-password-1");
      expect(result).toEqual({ ok: true, userId: user.id });
      const logins = await tx.auditLog.count({ where: { userId: user.id, action: "login" } });
      expect(logins).toBe(1);
    });
  });

  it("rejects a wrong password and an unknown user", async () => {
    await inRollback(async (tx) => {
      const role = await makeRole(tx, "T-cashier", []);
      await makeUser(tx, role.id, "t_ali");
      expect((await authenticate(tx, "t_ali", "wrong")).ok).toBe(false);
      expect((await authenticate(tx, "nobody_here", "x")).ok).toBe(false);
    });
  });

  it("locks for 5 minutes after 5 wrong passwords, even for the right password, then lets the owner unlock", async () => {
    await inRollback(async (tx) => {
      const role = await makeRole(tx, "T-cashier", []);
      const user = await makeUser(tx, role.id, "t_ali");
      const t0 = new Date("2026-10-10T10:00:00Z");
      for (let i = 0; i < LOGIN_LOCK_AFTER; i++) await authenticate(tx, "t_ali", "wrong", t0);

      const locked = await authenticate(tx, "t_ali", "right-password-1", new Date(t0.getTime() + 4 * 60_000));
      expect(locked).toMatchObject({ ok: false, reason: "locked" });

      const later = await authenticate(tx, "t_ali", "right-password-1", new Date(t0.getTime() + 5 * 60_000 + 1000));
      expect(later.ok).toBe(true);

      for (let i = 0; i < LOGIN_LOCK_AFTER; i++) await authenticate(tx, "t_ali", "wrong", t0);
      const owner = await makeUser(tx, role.id, "t_boss");
      await unlockUser(tx, owner.id, user.id);
      expect((await authenticate(tx, "t_ali", "right-password-1", t0)).ok).toBe(true);
    });
  });

  it("does not let a switched-off user log in, even with the right password", async () => {
    await inRollback(async (tx) => {
      const role = await makeRole(tx, "T-cashier", []);
      const user = await makeUser(tx, role.id, "t_ali", "right-password-1", { active: false });
      expect(await authenticate(tx, "t_ali", "right-password-1")).toMatchObject({ ok: false, reason: "inactive" });
      expect(await loadUser(tx, user.id)).toBeNull();
    });
  });
});

describe("permissions are read fresh from the database", () => {
  it("applies a role change straight away, without logging in again", async () => {
    await inRollback(async (tx) => {
      const cashier = await makeRole(tx, "T-cashier", ["billing.create"]);
      const manager = await makeRole(tx, "T-manager", ["billing.create", "users.manage"]);
      const user = await makeUser(tx, cashier.id, "t_ali");
      const actor = await makeUser(tx, manager.id, "t_boss");

      const before = await loadUser(tx, user.id);
      expect(can(before!, "users.manage")).toBe(false);

      await changeRole(tx, actor.id, user.id, manager.id);
      const after = await loadUser(tx, user.id);
      expect(can(after!, "users.manage")).toBe(true);
      expect(after!.roleName).toBe("T-manager");
    });
  });

  it("stops a switched-off user on the next request", async () => {
    await inRollback(async (tx) => {
      const role = await makeRole(tx, "T-cashier", ["billing.create"]);
      const user = await makeUser(tx, role.id, "t_ali");
      const actor = await makeUser(tx, role.id, "t_boss");
      expect(await loadUser(tx, user.id)).not.toBeNull();
      await setActive(tx, actor.id, user.id, false);
      expect(await loadUser(tx, user.id)).toBeNull();
    });
  });

  it("keeps a cashier out of manager-only permissions", async () => {
    await inRollback(async (tx) => {
      const role = await makeRole(tx, "T-cashier", ["billing.create"]);
      const user = await makeUser(tx, role.id, "t_ali");
      const loaded = (await loadUser(tx, user.id))!;
      expect(can(loaded, "billing.create")).toBe(true);
      expect(can(loaded, "users.manage")).toBe(false);
    });
  });

  it("approves on the spot only for a user who has the permission", async () => {
    await inRollback(async (tx) => {
      const cashier = await makeRole(tx, "T-cashier", ["billing.create"]);
      const manager = await makeRole(tx, "T-manager", ["discount.override_client"]);
      await makeUser(tx, cashier.id, "t_ali");
      const boss = await makeUser(tx, manager.id, "t_boss");
      expect(await verifyApprover(tx, "t_ali", "right-password-1", "discount.override_client")).toBeNull();
      expect(await verifyApprover(tx, "t_boss", "wrong", "discount.override_client")).toBeNull();
      expect((await verifyApprover(tx, "t_boss", "right-password-1", "discount.override_client"))?.id).toBe(boss.id);
    });
  });
});

describe("owner protection", () => {
  async function onlyOneOwner(tx: Db) {
    const ownerRole = await tx.role.findUniqueOrThrow({ where: { name: "Owner" } });
    await tx.user.updateMany({ where: { roleId: ownerRole.id }, data: { active: false } });
    const owner = await makeUser(tx, ownerRole.id, "t_owner");
    return { ownerRole, owner };
  }

  it("does not let the owner switch off their own account", async () => {
    await inRollback(async (tx) => {
      const { ownerRole, owner } = await onlyOneOwner(tx);
      await makeUser(tx, ownerRole.id, "t_owner2");
      expect(await setActive(tx, owner.id, owner.id, false)).toMatchObject({ ok: false });
    });
  });

  it("always keeps at least one active owner", async () => {
    await inRollback(async (tx) => {
      const { ownerRole, owner } = await onlyOneOwner(tx);
      const cashier = await makeRole(tx, "T-cashier", []);
      const manager = await makeUser(tx, cashier.id, "t_manager");
      expect(await setActive(tx, manager.id, owner.id, false)).toMatchObject({ ok: false });
      expect(await changeRole(tx, manager.id, owner.id, cashier.id)).toMatchObject({ ok: false });

      await makeUser(tx, ownerRole.id, "t_owner2");
      expect(await changeRole(tx, manager.id, owner.id, cashier.id)).toEqual({ ok: true });
    });
  });
});

describe("passwords", () => {
  it("makes a new user choose their own password at first login", async () => {
    await inRollback(async (tx) => {
      const role = await makeRole(tx, "T-cashier", []);
      const actor = await makeUser(tx, role.id, "t_boss");
      const created = await createUser(tx, actor.id, {
        username: "t_new",
        name: "New",
        roleId: role.id,
        password: "temporary-pass-1",
      });
      expect(created).toEqual({ ok: true });
      const user = await tx.user.findUniqueOrThrow({ where: { username: "t_new" } });
      expect((await loadUser(tx, user.id))?.mustChangePassword).toBe(true);

      expect(await changeOwnPassword(tx, user.id, "temporary-pass-1", "short")).toMatchObject({ ok: false });
      expect(await changeOwnPassword(tx, user.id, "temporary-pass-1", DEV_PASSWORD)).toMatchObject({ ok: false });
      expect(await changeOwnPassword(tx, user.id, "temporary-pass-1", "temporary-pass-1")).toMatchObject({ ok: false });
      expect(await changeOwnPassword(tx, user.id, "wrong-current", "my-own-password-9")).toMatchObject({ ok: false });
      expect(await changeOwnPassword(tx, user.id, "temporary-pass-1", "my-own-password-9")).toEqual({ ok: true });
      expect((await loadUser(tx, user.id))?.mustChangePassword).toBe(false);
      expect((await authenticate(tx, "t_new", "my-own-password-9")).ok).toBe(true);
    });
  });

  it("forces a new password again after an owner reset, and clears a lock", async () => {
    await inRollback(async (tx) => {
      const role = await makeRole(tx, "T-cashier", []);
      const actor = await makeUser(tx, role.id, "t_boss");
      const user = await makeUser(tx, role.id, "t_ali", "right-password-1", { lockedUntil: new Date(Date.now() + 60_000) });
      expect(await resetPassword(tx, actor.id, user.id, "temporary-pass-2")).toEqual({ ok: true });
      const after = await tx.user.findUniqueOrThrow({ where: { id: user.id } });
      expect(after.mustChangePassword).toBe(true);
      expect(after.lockedUntil).toBeNull();
      expect((await authenticate(tx, "t_ali", "temporary-pass-2")).ok).toBe(true);
    });
  });
});

describe("audit log", () => {
  it("records who changed a user, with old and new values", async () => {
    await inRollback(async (tx) => {
      const a = await makeRole(tx, "T-a", []);
      const b = await makeRole(tx, "T-b", []);
      const actor = await makeUser(tx, a.id, "t_boss");
      const user = await makeUser(tx, a.id, "t_ali");
      await changeRole(tx, actor.id, user.id, b.id);
      const row = await tx.auditLog.findFirstOrThrow({ where: { action: "role_changed", recordId: String(user.id) } });
      expect(row.userId).toBe(actor.id);
      expect(row.oldValue).toEqual({ role: "T-a" });
      expect(row.newValue).toEqual({ role: "T-b" });
    });
  });

  it("can only be added to: no edits, no deletes", async () => {
    await inRollback(async (tx) => {
      const row = await tx.auditLog.create({ data: { tableName: "t", recordId: "1", action: "x" } });
      await expect(tx.auditLog.update({ where: { id: row.id }, data: { action: "changed" } })).rejects.toThrow();
    });
    await inRollback(async (tx) => {
      const row = await tx.auditLog.create({ data: { tableName: "t", recordId: "1", action: "x" } });
      await expect(tx.auditLog.delete({ where: { id: row.id } })).rejects.toThrow();
    });
  });
});
