import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import {
  changeRoleAction,
  createUserAction,
  resetPasswordAction,
  setActiveAction,
  unlockAction,
} from "./actions";

export default async function UsersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const me = await requireUser("users.manage");
  const { error, done } = await searchParams;
  const [users, roles] = await Promise.all([
    db.user.findMany({ include: { role: true }, orderBy: { id: "asc" } }),
    db.role.findMany({ orderBy: { id: "asc" } }),
  ]);
  const now = new Date();

  return (
    <>
      <h1 className="text-[22px] font-semibold">Users</h1>
      {typeof error === "string" && <p role="alert" className="card border-danger text-danger">{error}</p>}
      {done && <p role="status" className="card bg-accent-soft text-accent-dark">Saved.</p>}

      <section aria-label="Users" className="card flex flex-col gap-3">
        {users.map((u) => {
          const locked = u.lockedUntil && u.lockedUntil > now;
          return (
            <div key={u.id} className="flex flex-col gap-3 border-b border-line pb-3 last:border-0 last:pb-0">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="font-semibold">{u.name}</span>
                <span className="font-mono text-muted">{u.username}</span>
                {!u.active && <span className="rounded bg-[#eeece6] px-2 text-sm">Switched off</span>}
                {locked && <span className="rounded bg-[#fff8ea] px-2 text-sm text-[#7a4e00]">Locked</span>}
                {u.mustChangePassword && <span className="text-sm text-muted">Must set a new password</span>}
                {u.id === me.id && <span className="text-sm text-muted">(you)</span>}
              </div>
              <div className="flex flex-wrap items-end gap-3">
                <form action={changeRoleAction} className="flex items-end gap-2">
                  <input type="hidden" name="userId" value={u.id} />
                  <label className="flex flex-col gap-1 text-xs text-muted">
                    Role
                    <select name="roleId" defaultValue={u.roleId} className="input w-40">
                      {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                    </select>
                  </label>
                  <button className="btn">Change role</button>
                </form>
                <form action={resetPasswordAction} className="flex items-end gap-2">
                  <input type="hidden" name="userId" value={u.id} />
                  <label className="flex flex-col gap-1 text-xs text-muted">
                    Temporary password
                    <input name="password" type="text" autoComplete="off" minLength={8} required className="input w-44" />
                  </label>
                  <button className="btn">Reset password</button>
                </form>
                {locked && (
                  <form action={unlockAction}>
                    <input type="hidden" name="userId" value={u.id} />
                    <button className="btn">Unlock now</button>
                  </form>
                )}
                <form action={setActiveAction}>
                  <input type="hidden" name="userId" value={u.id} />
                  <input type="hidden" name="active" value={String(!u.active)} />
                  <button className="btn">{u.active ? "Switch off" : "Switch on"}</button>
                </form>
              </div>
            </div>
          );
        })}
      </section>

      <section aria-label="New user" className="card flex flex-col gap-3">
        <h2 className="text-[15px] font-semibold">New user</h2>
        <form action={createUserAction} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-xs text-muted">Name<input name="name" required className="input" /></label>
          <label className="flex flex-col gap-1 text-xs text-muted">
            Username<input name="username" required autoCapitalize="none" className="input" />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted">
            Role
            <select name="roleId" className="input">
              {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted">
            Temporary password (they must change it at first login)
            <input name="password" type="text" autoComplete="off" minLength={8} required className="input" />
          </label>
          <button className="btn btn-primary sm:col-span-2">Add user</button>
        </form>
      </section>
    </>
  );
}
