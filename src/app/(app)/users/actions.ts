"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { changeRole, createUser, resetPassword, setActive, unlockUser } from "@/lib/users";

type R = { ok: true } | { ok: false; error: string };

// Every action re-checks the permission on the server.
async function run(fn: (actorId: number) => Promise<R>) {
  const actor = await requireUser("users.manage");
  const result = await fn(actor.id);
  redirect(result.ok ? "/users?done=1" : `/users?error=${encodeURIComponent(result.error)}`);
}

export async function createUserAction(formData: FormData) {
  await run((actor) =>
    createUser(db, actor, {
      username: String(formData.get("username") ?? ""),
      name: String(formData.get("name") ?? ""),
      roleId: Number(formData.get("roleId")),
      password: String(formData.get("password") ?? ""),
    }),
  );
}

export async function changeRoleAction(formData: FormData) {
  await run((actor) => changeRole(db, actor, Number(formData.get("userId")), Number(formData.get("roleId"))));
}

export async function setActiveAction(formData: FormData) {
  await run((actor) => setActive(db, actor, Number(formData.get("userId")), formData.get("active") === "true"));
}

export async function unlockAction(formData: FormData) {
  await run((actor) => unlockUser(db, actor, Number(formData.get("userId"))));
}

export async function resetPasswordAction(formData: FormData) {
  await run((actor) =>
    resetPassword(db, actor, Number(formData.get("userId")), String(formData.get("password") ?? "")),
  );
}
