"use client";

import { useActionState } from "react";
import { changePasswordAction, signOutAction, type PasswordState } from "./actions";

const fields = [
  { name: "current", label: "Current password", auto: "current-password" },
  { name: "next", label: "New password", auto: "new-password" },
  { name: "confirm", label: "New password again", auto: "new-password" },
];

export function PasswordForm() {
  const [state, action, pending] = useActionState<PasswordState, FormData>(changePasswordAction, {});
  return (
    <>
      <form action={action} className="flex flex-col gap-3.5">
        {fields.map((f) => (
          <div key={f.name} className="flex flex-col gap-1">
            <label htmlFor={f.name} className="text-[13px] text-muted">{f.label}</label>
            <input id={f.name} name={f.name} type="password" autoComplete={f.auto} required className="input" />
          </div>
        ))}
        {state.error && <p role="alert" className="text-sm text-danger">{state.error}</p>}
        <button type="submit" disabled={pending} className="btn btn-primary min-h-[52px] text-base">
          {pending ? "Saving…" : "Save new password"}
        </button>
      </form>
      <form action={signOutAction}>
        <button type="submit" className="btn w-full">Sign out</button>
      </form>
    </>
  );
}
