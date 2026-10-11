import Link from "next/link";
import { signOutAction } from "@/app/change-password/actions";
import { can } from "@/lib/auth-core";
import { requireUser } from "@/lib/session";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const links = [
    { href: "/", label: "Home", show: true },
    { href: "/items", label: "Items", show: true },
    { href: "/clients", label: "Clients", show: true },
    { href: "/users", label: "Users", show: can(user, "users.manage") },
  ].filter((l) => l.show);

  return (
    <>
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center gap-x-6 px-5">
          <span className="py-3.5 text-[17px] font-bold">Nabeel Dar Book Depot</span>
          {/* On a phone the menu collapses into a button. */}
          <details className="group ml-auto md:hidden">
            <summary className="btn cursor-pointer list-none">Menu</summary>
            <nav aria-label="Main" className="absolute left-0 right-0 z-10 flex flex-col border-b border-line bg-white px-5 pb-3">
              {links.map((l) => (
                <Link key={l.href} href={l.href} className="flex min-h-11 items-center">{l.label}</Link>
              ))}
              <form action={signOutAction}><button className="btn mt-2">Sign out</button></form>
            </nav>
          </details>
          <nav aria-label="Main" className="hidden flex-1 gap-0.5 md:flex">
            {links.map((l) => (
              <Link key={l.href} href={l.href} className="px-2.5 py-3.5 text-[#3d4248] hover:text-accent-dark">{l.label}</Link>
            ))}
          </nav>
          <div className="ml-auto hidden items-center gap-3 md:flex">
            <span className="text-sm text-muted">{user.name} · {user.roleName}</span>
            <form action={signOutAction}><button className="btn">Sign out</button></form>
          </div>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-[1440px] flex-1 flex-col gap-4 p-5">{children}</main>
    </>
  );
}
