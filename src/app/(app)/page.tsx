import { requireUser } from "@/lib/session";

export default async function HomePage() {
  const user = await requireUser();
  return (
    <section className="card flex flex-col gap-2">
      <h1 className="text-[22px] font-semibold">Welcome, {user.name}</h1>
      <p className="text-muted">You are signed in as {user.roleName}. The billing screens arrive in the next build steps.</p>
    </section>
  );
}
