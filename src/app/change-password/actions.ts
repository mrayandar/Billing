"use server";

import { redirect } from "next/navigation";
import { signOut } from "@/auth";
import { changeOwnPassword } from "@/lib/auth-core";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

export type PasswordState = { error?: string };

export async function changePasswordAction(_prev: PasswordState, formData: FormData): Promise<PasswordState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const next = String(formData.get("next") ?? "");
  if (next !== String(formData.get("confirm") ?? "")) return { error: "The two new passwords do not match." };
  const result = await changeOwnPassword(db, user.id, String(formData.get("current") ?? ""), next);
  if (!result.ok) return { error: result.error };
  redirect("/");
}

export async function signOutAction() {
  await signOut({ redirectTo: "/login" });
}
