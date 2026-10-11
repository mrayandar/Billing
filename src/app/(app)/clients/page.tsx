import Link from "next/link";
import { can } from "@/lib/auth-core";
import { db } from "@/lib/db";
import { formatRs } from "@/lib/money";
import { requireUser } from "@/lib/session";

type Params = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const TYPE_LABEL: Record<string, string> = {
  RETAIL: "Retail",
  WHOLESALE: "Wholesale",
  SCHOOL: "School",
  SUB_DEALER: "Sub-dealer",
};

export default async function ClientsPage({ searchParams }: { searchParams: Promise<Params> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const q = one(sp.q).trim();
  const showOff = one(sp.off) === "1";
  const page = Math.max(1, Number(one(sp.page)) || 1);
  const pageSize = 30;

  const where = {
    ...(showOff ? {} : { active: true }),
    ...(q
      ? {
          OR: [
            { code: { startsWith: q, mode: "insensitive" as const } },
            { name: { contains: q, mode: "insensitive" as const } },
            { mobile: { contains: q } },
            { phone2: { contains: q } },
            { area: { contains: q, mode: "insensitive" as const } },
            { city: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };
  const [total, clients] = await Promise.all([
    db.client.count({ where }),
    db.client.findMany({ where, orderBy: [{ name: "asc" }, { id: "asc" }], skip: (page - 1) * pageSize, take: pageSize }),
  ]);
  const sums = await db.ledgerEntry.groupBy({
    by: ["clientId"],
    where: { partyType: "CLIENT", clientId: { in: clients.map((c) => c.id) } },
    _sum: { debit: true, credit: true },
  });
  const balance = new Map(sums.map((s) => [s.clientId, (s._sum.debit ?? 0) - (s._sum.credit ?? 0)]));
  const lastPage = Math.max(1, Math.ceil(total / pageSize));
  const link = (extra: Record<string, string>) => {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (showOff) p.set("off", "1");
    for (const [k, v] of Object.entries(extra)) p.set(k, v);
    return `/clients?${p.toString()}`;
  };

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[22px] font-semibold">
          Clients <span className="text-[15px] font-normal text-muted">{total.toLocaleString("en-US")}</span>
        </h1>
        {can(user, "clients.edit") && <Link href="/clients/new" className="btn btn-primary px-4">+ New client</Link>}
      </div>

      <section className="card flex flex-col gap-2.5">
        <form action="/clients" className="flex flex-wrap items-end gap-2.5">
          <label className="flex min-w-[220px] flex-1 flex-col gap-1">
            <span className="text-xs text-muted">Search code, name, phone or area</span>
            <input name="q" defaultValue={q} autoComplete="off" className="input" />
          </label>
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input type="checkbox" name="off" value="1" defaultChecked={showOff} className="size-[18px] accent-[#0b6b66]" /> Include switched-off clients
          </label>
          <button className="btn">Search</button>
        </form>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse">
            <thead>
              <tr className="text-left text-xs text-muted">
                <th className="px-2 py-1.5 font-medium">Code</th>
                <th className="px-2 py-1.5 font-medium">Client</th>
                <th className="px-2 py-1.5 font-medium">Type</th>
                <th className="px-2 py-1.5 font-medium">Phone</th>
                <th className="px-2 py-1.5 text-right font-medium">Balance</th>
              </tr>
            </thead>
            <tbody>
              {clients.map((c) => {
                const b = balance.get(c.id) ?? 0;
                return (
                  <tr key={c.id} className="border-t border-[#ece9e2]">
                    <td className="px-2 py-2 font-mono"><Link href={`/clients/${c.id}`} className="text-foreground">{c.code}</Link></td>
                    <td className="px-2 py-2">
                      <Link href={`/clients/${c.id}`} className="text-foreground no-underline">{c.name}</Link>
                      {!c.active && <span className="ml-2 rounded bg-[#eeece6] px-1.5 text-xs">switched off</span>}
                    </td>
                    <td className="px-2 py-2 text-muted">{TYPE_LABEL[c.type]}</td>
                    <td className="px-2 py-2 font-mono">{c.mobile ?? ""}</td>
                    <td className={`px-2 py-2 text-right font-mono ${b > 0 ? "" : "text-muted"}`}>{b === 0 ? "—" : b > 0 ? formatRs(b) : `${formatRs(-b)} advance`}</td>
                  </tr>
                );
              })}
              {clients.length === 0 && <tr><td colSpan={5} className="px-2 py-6 text-center text-muted">No clients match.</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between text-[13px] text-muted">
          <span>Showing {clients.length} of {total.toLocaleString("en-US")}</span>
          <span className="flex gap-4">
            {page > 1 && <Link href={link({ page: String(page - 1) })}>Previous page</Link>}
            {page < lastPage && <Link href={link({ page: String(page + 1) })}>Next page</Link>}
          </span>
        </div>
      </section>
    </>
  );
}
