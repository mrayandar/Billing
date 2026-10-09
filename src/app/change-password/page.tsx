import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { PasswordForm } from "./password-form";

export default async function ChangePasswordPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return (
    <div className="flex flex-1 items-center justify-center px-4 py-8">
      <main className="flex w-full max-w-[420px] flex-col gap-5">
        <section className="card flex flex-col gap-3.5 p-6">
          <h1 className="text-lg font-semibold">Set a new password</h1>
          {user.mustChangePassword && (
            <p className="text-sm text-muted">
              Hello {user.name}. Before you start, choose your own password. Use at least 8 characters.
            </p>
          )}
          <PasswordForm />
        </section>
      </main>
    </div>
  );
}
