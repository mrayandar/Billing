import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/");
  return (
    <div className="flex flex-1 items-center justify-center px-4 py-8">
      <main className="flex w-full max-w-[420px] flex-col gap-5">
        <div className="flex flex-col items-center gap-0.5 text-center">
          <span className="text-[26px] font-bold">Nabeel Dar Book Depot</span>
          <span lang="ur" dir="rtl" className="font-urdu text-lg leading-loose">نبیل ڈار بک ڈپو</span>
        </div>
        <section aria-label="Sign in" className="card flex flex-col gap-3.5 p-6">
          <h1 className="text-lg font-semibold">Sign in</h1>
          <LoginForm />
          <p className="text-center text-sm">Forgot password? Ask the owner to reset it</p>
        </section>
      </main>
    </div>
  );
}
