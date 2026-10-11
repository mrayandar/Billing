import Link from "next/link";
import { db } from "@/lib/db";
import { can } from "@/lib/auth-core";
import { requireUser } from "@/lib/session";
import { createClientAction } from "../actions";
import { ClientForm } from "../client-form";

export default async function NewClientPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser("clients.edit");
  const { error } = await searchParams;
  let copyFrom: { id: number; name: string; companies: number; books: number }[] = [];
  if (can(user, "client_rules.edit")) {
    const clients = await db.client.findMany({
      where: { active: true, OR: [{ companyDiscounts: { some: { active: true } } }, { itemRules: { some: { active: true } } }] },
      orderBy: { name: "asc" },
      take: 8,
      select: {
        id: true,
        name: true,
        _count: { select: { companyDiscounts: { where: { active: true } }, itemRules: { where: { active: true } } } },
      },
    });
    copyFrom = clients.map((c) => ({ id: c.id, name: c.name, companies: c._count.companyDiscounts, books: c._count.itemRules }));
  }
  return (
    <>
      <div>
        <Link href="/clients" className="text-[13px] text-accent">← Clients</Link>
        <h1 className="mt-1 text-[22px] font-semibold">New client</h1>
      </div>
      {typeof error === "string" && <p role="alert" className="card border-danger text-danger">{error}</p>}
      <ClientForm action={createClientAction} submitLabel="Save client" copyFrom={copyFrom} />
    </>
  );
}
