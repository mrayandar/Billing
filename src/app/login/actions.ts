"use server";

import { AuthError, CredentialsSignin } from "next-auth";
import { signIn } from "@/auth";

export type LoginState = { error?: string };

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  try {
    await signIn("credentials", {
      username: formData.get("username"),
      password: formData.get("password"),
      redirectTo: "/",
    });
  } catch (e) {
    if (e instanceof CredentialsSignin || e instanceof AuthError) {
      return { error: "Wrong username or password. After 5 wrong tries the account locks for 5 minutes." };
    }
    throw e; // the redirect after a good login is thrown too and must pass through
  }
  return {};
}
