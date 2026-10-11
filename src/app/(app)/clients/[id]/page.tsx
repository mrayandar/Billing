import Link from "next/link";
import { notFound } from "next/navigation";
import { can } from "@/lib/auth-core";
import { clientBalance, quoteLines, ruleHistory } from "@/lib/clients";
import { db } from "@/lib/db";
import { findItemByCodeOrBarcode, searchItems } from "@/lib/items";
import { formatRs, paisaToRupeesText } from "@/lib/money";
import { bpToPercentText } from "@/lib/pricing";
import { requireUser } from "@/lib/session";
import {
  addBookRuleAction,
  copyRulesAction,
  saveBookRuleAction,
  saveCompanyDiscountsAction,
  setClientActiveAction,
  toggleBookRuleAction,
} from "../actions";

type Params = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const SOURCE_LABEL: Record<string, string> = {
  BOOK_RULE: "book rule",
  COMPANY_RULE: "company rule",
  LAST_SALE: "last sale",
  MANUAL: "manual",
  NONE: "no rule, base price",
};
const fmtDate = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });

export default async function ClientPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Params>;
}) {
  const user = await requireUser();
  const { id: idText } = await params;
  const sp = await searchParams;
  const id = Number(idText) || 0;
  const client = await db.client.findUnique({ where: { id } });
  if (!client) notFound();

  const canRules = can(user, "client_rules.edit");
  const canEdit = can(user, "clients.edit");
  const cf = one(sp.cf).trim();
  const check = one(sp.check).trim();
  const error = one(sp.error);

  const [balance, companies, companyRules, bookRules, otherClients] = await Promise.all([
    clientBalance(db, id),
    db.company.findMany({
      where: cf ? { name: { contains: cf, mode: "insensitive" } } : {},
      orderBy: { name: "asc" },
      take: 60,
      include: { _count: { select: { items: true } } },
    }),
    db.clientCompanyDiscount.findMany({ where: { clientId: id } }),
    db.clientItemRule.findMany({ where: { clientId: id }, include: { item: true }, orderBy: [{ active: "desc" }, { setAt: "desc" }] }),
    canRules ? db.client.findMany({ where: { id: { not: id }, active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }) : [],
  ]);
  const companyTotal = await db.company.count();
  const ruleByCompany = new Map(companyRules.map((r) => [r.companyId, r]));
  const userIds = [...new Set([...bookRules.map((r) => r.setById), ...companyRules.map((r) => r.updatedById)].filter((x): x is number => x !== null))];
  const users = await db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } });
  const userName = new Map(users.map((u) => [u.id, u.name]));

  // "Check a price for this client"
  let checked: { name: string; base: number; price: number; discountBp: number; source: string; total: number } | null = null;
  let checkError = "";
  if (check) {
    const item = (await findItemByCodeOrBarcode(db, check)) ?? (await searchItems(db, { q: check, chip: "all", pageSize: 1 })).items[0];
    if (!item) checkError = `No item found for "${check}".`;
    else {
      const [l] = await quoteLines(db, id, [{ itemId: item.id, qty: 1 }]);
      checked = { name: item.name, base: item.basePrice, price: l.price, discountBp: l.discountBp, source: l.source, total: l.lineTotal };
    }
  }

  const showHistory = one(sp.history) === "1";
  const history = showHistory ? await ruleHistory(db, id) : [];
  const limitText = client.creditLimit ? formatRs(client.creditLimit) : "no limit set";

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href="/clients" className="text-[13px] text-accent">← Clients</Link>
          <h1 className="mt-1 text-[22px] font-semibold">
            {client.name} <span className="ml-1 font-mono text-base font-normal text-muted">#{client.code}</span>
            {!client.active && <span className="ml-2 rounded bg-[#eeece6] px-2 text-sm font-normal">switched off</span>}
          </h1>
          <p className="text-muted">
            {client.type.replace("_", " ").toLowerCase()} · {client.mobile ?? "no phone"} · balance{" "}
            {balance >= 0 ? formatRs(balance) : `${formatRs(-balance)} advance`} · credit limit {limitText}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canEdit && <Link href={`/clients/${id}/edit`} className="btn">Edit details</Link>}
          <Link href={`/clients/${id}?history=1#history`} className="btn">Change history</Link>
          {canEdit && (
            <form action={setClientActiveAction}>
              <input type="hidden" name="id" value={id} />
              <input type="hidden" name="active" value={String(!client.active)} />
              <button className="btn">{client.active ? "Switch off" : "Switch on"}</button>
            </form>
          )}
        </div>
      </div>

      {error && <p role="alert" className="card border-danger text-danger">{error}</p>}
      {one(sp.done) && <p role="status" className="card bg-accent-soft text-accent-dark">Saved.</p>}

      <div className="card text-[13px] text-[#3d4248]">
        On a bill, a <strong>book rule</strong> (special price or discount for that book) is used first and replaces the company
        rule completely. If the book has none, the <strong>company rule</strong> is used. If neither is set, the client pays the
        full base price. Rules are switched off, never deleted. Book rules can be set here or saved straight from a bill.
      </div>

      <div className="flex flex-wrap items-start gap-4">
        <section aria-label="Company discounts" className="card flex min-w-0 flex-[1_1_520px] flex-col gap-2.5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-[15px] font-semibold">Company discounts</h2>
            <form action={`/clients/${id}`} className="flex gap-2">
              <input name="cf" defaultValue={cf} placeholder="Filter companies" aria-label="Filter companies" className="input w-44" />
              <button className="btn">Filter</button>
            </form>
          </div>
          <form action={saveCompanyDiscountsAction} className="flex flex-col gap-2.5">
            <input type="hidden" name="clientId" value={id} />
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="text-left text-xs text-muted">
                    <th className="px-2 py-1.5 font-medium">Company</th>
                    <th className="px-2 py-1.5 text-right font-medium">Items</th>
                    <th className="w-28 px-2 py-1.5 text-right font-medium">Discount %</th>
                    <th className="px-2 py-1.5 font-medium">Last changed</th>
                  </tr>
                </thead>
                <tbody>
                  {companies.map((c) => {
                    const r = ruleByCompany.get(c.id);
                    const active = r?.active ? r : undefined;
                    return (
                      <tr key={c.id} className="border-t border-[#ece9e2]">
                        <td className="px-2 py-1.5 font-medium">{c.name}</td>
                        <td className="px-2 py-1.5 text-right font-mono text-muted">{c._count.items.toLocaleString("en-US")}</td>
                        <td className="px-2 py-1.5 text-right">
                          <input
                            name={`d_${c.id}`}
                            defaultValue={active ? bpToPercentText(active.discountBp) : ""}
                            placeholder="none"
                            inputMode="decimal"
                            disabled={!canRules}
                            aria-label={`${c.name} discount`}
                            className="input w-20 text-right font-mono"
                          />
                        </td>
                        <td className="px-2 py-1.5 text-[13px] text-muted">
                          {r ? (
                            <>
                              {fmtDate(r.updatedAt)}
                              {r.updatedById ? ` · ${userName.get(r.updatedById) ?? ""}` : ""}
                              {r.sourceBillNo ? ` · bill ${r.sourceBillNo}` : ""}
                              {!r.active ? " · switched off" : ""}
                            </>
                          ) : (
                            "Not set"
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[13px] text-muted">Showing {companies.length} of {companyTotal} companies. Empty box = no discount.</span>
              {canRules && <button className="btn btn-primary px-5">Save changes</button>}
            </div>
          </form>
        </section>

        <section aria-label="Book rules" className="card flex min-w-0 flex-[1_1_520px] flex-col gap-2.5">
          <h2 className="text-[15px] font-semibold">
            Book rules <span className="text-[13px] font-normal text-muted">· special price or discount per book</span>
          </h2>
          {canRules && (
            <form action={addBookRuleAction} className="flex flex-wrap items-end gap-2">
              <input type="hidden" name="clientId" value={id} />
              <label className="flex min-w-[180px] flex-1 flex-col gap-1">
                <span className="text-xs text-muted">Add a book by code or name</span>
                <input name="book" required placeholder="e.g. 1103 or Science 8" autoComplete="off" className="input" />
              </label>
              <label className="flex w-24 flex-col gap-1">
                <span className="text-xs text-muted">Price</span>
                <input name="specialPrice" placeholder="base" inputMode="decimal" className="input text-right font-mono" />
              </label>
              <label className="flex w-20 flex-col gap-1">
                <span className="text-xs text-muted">Disc %</span>
                <input name="discount" inputMode="decimal" className="input text-right font-mono" />
              </label>
              <button className="btn">Add</button>
            </form>
          )}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] border-collapse">
              <thead>
                <tr className="text-left text-xs text-muted">
                  <th className="px-2 py-1.5 font-medium">Code</th>
                  <th className="px-2 py-1.5 font-medium">Book</th>
                  <th className="px-2 py-1.5 text-right font-medium">Base</th>
                  <th className="w-24 px-2 py-1.5 text-right font-medium">Price</th>
                  <th className="w-20 px-2 py-1.5 text-right font-medium">Disc %</th>
                  <th className="px-2 py-1.5 font-medium">Set from</th>
                  <th className="px-2 py-1.5"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {bookRules.map((r) => (
                  <tr key={r.id} className={`border-t border-[#ece9e2] ${r.active ? "" : "bg-[#f6f5f1] text-muted"}`}>
                    <td className="px-2 py-1.5 font-mono">{r.item.code}</td>
                    <td className="px-2 py-1.5">{r.item.name}</td>
                    <td className="px-2 py-1.5 text-right font-mono text-muted">{paisaToRupeesText(r.item.basePrice)}</td>
                    <td colSpan={2} className="px-2 py-1.5">
                      <form id={`rule-${r.id}`} action={saveBookRuleAction} className="flex justify-end gap-2">
                        <input type="hidden" name="clientId" value={id} />
                        <input type="hidden" name="itemId" value={r.itemId} />
                        <input name="specialPrice" defaultValue={r.specialPrice !== null ? paisaToRupeesText(r.specialPrice) : ""} placeholder="base" inputMode="decimal" disabled={!canRules} aria-label={`Price for ${r.item.code}`} className="input w-24 text-right font-mono" />
                        <input name="discount" defaultValue={r.discountBp !== null ? bpToPercentText(r.discountBp) : ""} inputMode="decimal" disabled={!canRules} aria-label={`Discount for ${r.item.code}`} className="input w-20 text-right font-mono" />
                      </form>
                    </td>
                    <td className="px-2 py-1.5 text-xs text-muted">
                      {r.setById ? userName.get(r.setById) : ""} · {fmtDate(r.setAt)}
                      {r.sourceBillNo ? ` · bill ${r.sourceBillNo}` : ""}
                      {!r.active ? " · switched off" : ""}
                    </td>
                    <td className="px-2 py-1.5">
                      {canRules && (
                        <div className="flex justify-end gap-1.5">
                          <button form={`rule-${r.id}`} className="btn">Save</button>
                          <form action={toggleBookRuleAction}>
                            <input type="hidden" name="clientId" value={id} />
                            <input type="hidden" name="itemId" value={r.itemId} />
                            <input type="hidden" name="active" value={String(!r.active)} />
                            <button className="btn">{r.active ? "Switch off" : "Switch on"}</button>
                          </form>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
                {bookRules.length === 0 && <tr><td colSpan={7} className="px-2 py-5 text-center text-muted">No book rules yet.</td></tr>}
              </tbody>
            </table>
          </div>

          <div className="flex flex-col gap-1.5 border-t border-[#ece9e2] pt-2.5">
            <form action={`/clients/${id}`} className="flex flex-wrap items-end gap-2">
              <label className="flex min-w-[200px] flex-1 flex-col gap-1">
                <span className="text-xs text-muted">Check a price for this client</span>
                <input name="check" defaultValue={check} placeholder="Item code or name" autoComplete="off" className="input" />
              </label>
              <button className="btn">Check</button>
            </form>
            {checkError && <p className="text-sm text-danger">{checkError}</p>}
            {checked && (
              <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                <span>{checked.name}</span>
                <span className="font-mono text-muted">
                  {paisaToRupeesText(checked.price)} − {bpToPercentText(checked.discountBp)}% ({SOURCE_LABEL[checked.source]})
                </span>
                <span className="font-mono font-semibold">= {paisaToRupeesText(checked.total)}</span>
              </div>
            )}
          </div>
        </section>
      </div>

      {canRules && (
        <section aria-label="Copy discounts" className="card flex flex-wrap items-end gap-3">
          <form action={copyRulesAction} className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="clientId" value={id} />
            <label className="flex flex-col gap-1">
              <span className="text-xs text-muted">Copy another client&apos;s discounts onto this client</span>
              <select name="fromClientId" defaultValue="" className="input w-64">
                <option value="">Choose a client…</option>
                {otherClients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
            <button className="btn">Copy from another client</button>
          </form>
          <span className="text-[13px] text-muted">Adds their company discounts and book rules. Anything you already set is replaced for the same company or book.</span>
        </section>
      )}

      {showHistory && (
        <section id="history" aria-label="Change history" className="card flex flex-col gap-2">
          <h2 className="text-[15px] font-semibold">Change history</h2>
          {history.length === 0 && <p className="text-muted">No changes recorded yet.</p>}
          {history.map((h) => (
            <div key={h.id} className="border-t border-[#ece9e2] pt-2 text-sm">
              <span className="text-muted">{h.time.toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>{" "}
              <strong>{h.userName || "system"}</strong> · {h.tableName === "client_item_rules" ? "book rule" : "company discount"} · {h.action.replace("_", " ")}
              <div className="font-mono text-xs text-muted">
                {h.oldValue ? `was ${JSON.stringify(h.oldValue)} → ` : ""}{JSON.stringify(h.newValue)}
              </div>
            </div>
          ))}
        </section>
      )}
    </>
  );
}
