import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { can, loadUser, type CurrentUser } from "./auth-core";
import { db } from "./db";

// Called on every protected page and server action. Reads the user from the database each
// time, so a switched-off account or a changed role takes effect on the next click.
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const session = await auth();
  const id = (session?.user as { id?: number } | undefined)?.id;
  return id ? loadUser(db, id) : null;
}

export async function requireUser(permission?: string): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.mustChangePassword) redirect("/change-password");
  if (permission && !can(user, permission)) redirect("/not-allowed");
  return user;
}
