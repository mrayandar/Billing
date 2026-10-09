"use client";

import { useActionState } from "react";
import { loginAction, type LoginState } from "./actions";

export function LoginForm() {
  const [state, action, pending] = useActionState<LoginState, FormData>(loginAction, {});
  return (
    <form action={action} className="flex flex-col gap-3.5">
      <div className="flex flex-col gap-1">
        <label htmlFor="username" className="text-[13px] text-muted">Username</label>
        <input id="username" name="username" autoComplete="username" autoCapitalize="none" required className="input" />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="password" className="text-[13px] text-muted">Password</label>
        <input id="password" name="password" type="password" autoComplete="current-password" required className="input" />
      </div>
      {state.error && <p role="alert" className="text-sm text-danger">{state.error}</p>}
      <button type="submit" disabled={pending} className="btn btn-primary min-h-[52px] text-base">
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
