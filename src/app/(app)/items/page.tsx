import Link from "next/link";
import { can } from "@/lib/auth-core";
import { db } from "@/lib/db";
import { categoryPaths, searchItems, stockByBatch, stockByItem } from "@/lib/items";
import { paisaToRupeesText } from "@/lib/money";
import { requireUser } from "@/lib/session";
import { addBarcodeAction, removeBarcodeAction, setUnitsAction, updateItemAction } from "./actions";
import { ItemForm } from "./item-form";

type Params = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const CHIPS = [
  { key: "active", label: "Active" },
  { key: "low", label: "Low stock" },
  { key: "old", label: "Old editions" },
  { key: "all", label: "All" },
] as const;

export default async function ItemsPage({ searchParams }: { searchParams: Promise<Params> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const q = one(sp.q);
  const companyId = Number(one(sp.company)) || undefined;
  const categoryId = Number(one(sp.category)) || undefined;
  const chip = (CHIPS.find((c) => c.key === one(sp.chip))?.key ?? "active") as (typeof CHIPS)[number]["key"];
  const page = Math.max(1, Number(one(sp.page)) || 1);
  const selectedId = Number(one(sp.id)) || undefined;
  const canEdit = can(user, "items.edit");
  const canSeeCost = can(user, "cost.view");

  const [result, companies, categories] = await Promise.all([
    searchItems(db, { q, companyId, categoryId, chip, page }),
    db.company.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    categoryPaths(db),
  ]);
  const catPath = new Map(categories.map((c) => [c.id, c.path]));
  const stock = await stockByItem(db, result.items.map((i) => i.id));
  const totalItems = await db.item.count();

  const selected = selectedId
    ? await db.item.findUnique({
        where: { id: selectedId },
        include: { company: true, barcodes: true, units: { orderBy: { factor: "asc" } }, batches: { orderBy: { receivedDate: "asc" } } },
      })
    : null;
  const batchStock = selected ? await stockByBatch(db, selected.id) : new Map<number, number>();

  const keep = (extra: Record<string, string>) => {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (companyId) p.set("company", String(companyId));
    if (categoryId) p.set("category", String(categoryId));
    if (chip !== "active") p.set("chip", chip);
    for (const [k, v] of Object.entries(extra)) p.set(k, v);
    return `/items?${p.toString()}`;
  };
  const lastPage = Math.max(1, Math.ceil(result.total / result.pageSize));
  const error = one(sp.error);

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[22px] font-semibold">
          Items <span className="text-[15px] font-normal text-muted">{totalItems.toLocaleString("en-US")} items</span>
        </h1>
        {canEdit && (
          <div className="flex flex-wrap gap-2">
            <Link href="/items/setup" className="btn">Companies and categories</Link>
            <Link href="/items/new" className="btn btn-primary px-4">New item</Link>
          </div>
        )}
      </div>
      {error && <p role="alert" className="card border-danger text-danger">{error}</p>}
      {one(sp.done) && <p role="status" className="card bg-accent-soft text-accent-dark">Saved.</p>}

      <div className="flex flex-wrap items-start gap-4">
        <section aria-label="Item list" className="card flex min-w-0 flex-[999_1_640px] flex-col gap-2.5">
          <form className="flex flex-wrap gap-2.5" action="/items">
            <label className="flex min-w-[220px] flex-1 flex-col gap-1">
              <span className="text-xs text-muted">Search code, name, author or ISBN</span>
              <input name="q" defaultValue={q} autoComplete="off" className="input" />
            </label>
            <label className="flex w-full flex-col gap-1 sm:w-44">
              <span className="text-xs text-muted">Company</span>
              <select name="company" defaultValue={companyId ?? ""} className="input">
                <option value="">All companies</option>
                {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
            <label className="flex w-full flex-col gap-1 sm:w-56">
              <span className="text-xs text-muted">Category</span>
              <select name="category" defaultValue={categoryId ?? ""} className="input">
                <option value="">All categories</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.path}</option>)}
              </select>
            </label>
            {chip !== "active" && <input type="hidden" name="chip" value={chip} />}
            <button className="btn self-end">Search</button>
          </form>

          <div className="flex flex-wrap gap-1.5">
            {CHIPS.map((c) => (
              <Link
                key={c.key}
                href={keep({ chip: c.key })}
                aria-current={chip === c.key ? "true" : undefined}
                className={`inline-flex min-h-8 items-center rounded-2xl px-3 text-[13px] ${
                  chip === c.key ? "bg-accent-soft font-semibold text-accent-dark" : "border border-line bg-white"
                }`}
              >
                {c.label}
              </Link>
            ))}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse">
              <thead>
                <tr className="text-left text-xs text-muted">
                  <th className="px-2 py-1.5 font-medium">Code</th>
                  <th className="px-2 py-1.5 font-medium">Item</th>
                  <th className="px-2 py-1.5 font-medium">Company</th>
                  <th className="px-2 py-1.5 font-medium">Category</th>
                  <th className="px-2 py-1.5 text-right font-medium">Price</th>
                  <th className="px-2 py-1.5 text-right font-medium">Stock</th>
                </tr>
              </thead>
              <tbody>
                {result.items.map((i) => {
                  const s = stock.get(i.id) ?? 0;
                  const low = s <= i.minStock;
                  return (
                    <tr key={i.id} className={`border-t border-[#ece9e2] ${i.id === selectedId ? "bg-accent-soft" : ""}`}>
                      <td className="px-2 py-2 font-mono">
                        <Link href={keep({ id: String(i.id) })} className="text-foreground">{i.code}</Link>
                      </td>
                      <td className={`px-2 py-2 ${i.id === selectedId ? "font-semibold" : ""}`}>
                        <Link href={keep({ id: String(i.id) })} className="text-foreground no-underline">{i.name}</Link>
                        {i.status !== "ACTIVE" && <span className="ml-2 rounded bg-[#eeece6] px-1.5 text-xs">{i.status.replace("_", " ").toLowerCase()}</span>}
                      </td>
                      <td className="px-2 py-2">{i.company.name}</td>
                      <td className="px-2 py-2 text-muted">{i.categoryId ? catPath.get(i.categoryId) : ""}</td>
                      <td className="px-2 py-2 text-right font-mono">{paisaToRupeesText(i.basePrice)}</td>
                      <td className={`px-2 py-2 text-right font-mono ${low ? "font-semibold text-danger" : ""}`}>{s}</td>
                    </tr>
                  );
                })}
                {result.items.length === 0 && (
                  <tr><td colSpan={6} className="px-2 py-6 text-center text-muted">No items match.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between text-[13px] text-muted">
            <span>
              Showing {result.items.length} of {result.total.toLocaleString("en-US")} items
            </span>
            <span className="flex gap-4">
              {page > 1 && <Link href={keep({ page: String(page - 1) })}>Previous page</Link>}
              {page < lastPage && <Link href={keep({ page: String(page + 1) })}>Next page</Link>}
            </span>
          </div>
        </section>

        <section aria-label="Item details" className="card flex min-w-0 flex-[1_1_420px] flex-col gap-3">
          {!selected ? (
            <p className="text-muted">Pick an item from the list to see its details.</p>
          ) : (
            <>
              <div className="flex items-baseline justify-between gap-2">
                <h2 className="text-base font-semibold">{selected.name}</h2>
                <span className="font-mono text-muted">{selected.code}</span>
              </div>

              {canEdit ? (
                <ItemForm
                  item={{ ...selected, companyName: selected.company.name }}
                  companies={companies.map((c) => c.name)}
                  categories={categories}
                  canSeeCost={canSeeCost}
                  action={updateItemAction}
                  submitLabel="Save"
                />
              ) : (
                <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
                  <dt className="text-muted">Company</dt><dd>{selected.company.name}</dd>
                  <dt className="text-muted">Category</dt><dd>{selected.categoryId ? catPath.get(selected.categoryId) : "—"}</dd>
                  <dt className="text-muted">ISBN</dt><dd className="font-mono">{selected.isbn ?? "—"}</dd>
                  <dt className="text-muted">Author</dt><dd>{selected.author ?? "—"}</dd>
                  <dt className="text-muted">Base price</dt><dd className="font-mono">{paisaToRupeesText(selected.basePrice)}</dd>
                  {canSeeCost && (<><dt className="text-muted">Average cost</dt><dd className="font-mono">{paisaToRupeesText(selected.costPrice)}</dd></>)}
                  <dt className="text-muted">Unit</dt><dd>{selected.baseUnit}</dd>
                  <dt className="text-muted">Minimum stock</dt><dd className="font-mono">{selected.minStock}</dd>
                  {selected.nameUrdu && (<><dt className="text-muted">Name in Urdu</dt><dd lang="ur" dir="rtl" className="font-urdu leading-loose">{selected.nameUrdu}</dd></>)}
                </dl>
              )}

              <div className="flex flex-col gap-1.5">
                <span className="text-xs text-muted">Barcodes</span>
                <div className="flex flex-wrap gap-1.5">
                  {selected.barcodes.map((b) => (
                    <span key={b.id} className="inline-flex items-center gap-1 rounded bg-[#eeece6] px-2 py-0.5 font-mono text-[13px]">
                      {b.barcode} <span className="font-sans text-muted">· {b.label ?? "barcode"}</span>
                      {canEdit && (
                        <form action={removeBarcodeAction}>
                          <input type="hidden" name="id" value={selected.id} />
                          <input type="hidden" name="barcode" value={b.barcode} />
                          <button aria-label={`Remove barcode ${b.barcode}`} className="ml-1 min-h-6 min-w-6 text-muted">×</button>
                        </form>
                      )}
                    </span>
                  ))}
                </div>
                {canEdit && (
                  <form action={addBarcodeAction} className="flex gap-2">
                    <input type="hidden" name="id" value={selected.id} />
                    <input name="barcode" placeholder="Scan or type a new barcode" autoComplete="off" aria-label="New barcode" className="input font-mono" />
                    <button className="btn whitespace-nowrap">+ Add barcode</button>
                  </form>
                )}
              </div>

              <div className="flex flex-col gap-1.5">
                <span className="text-xs text-muted">Larger units (stock is kept in {selected.baseUnit})</span>
                {canEdit ? (
                  <form action={setUnitsAction} className="flex flex-col gap-2">
                    <input type="hidden" name="id" value={selected.id} />
                    <textarea
                      name="units"
                      rows={Math.max(2, selected.units.length)}
                      defaultValue={selected.units.map((u) => `${u.unitName} = ${u.factor}`).join("\n")}
                      placeholder={"dozen = 12\nbox = 24\ncarton = 288"}
                      aria-label="Larger units"
                      className="input py-2 font-mono"
                    />
                    <button className="btn self-end">Save units</button>
                  </form>
                ) : (
                  <p className="text-sm">{selected.units.map((u) => `1 ${u.unitName} = ${u.factor} ${selected.baseUnit}`).join(", ") || "None"}</p>
                )}
              </div>

              <div className="flex flex-col gap-1.5">
                <span className="text-xs text-muted">Stock by printed price · billing sells the oldest copies first, automatically</span>
                <table className="w-full border-collapse text-[13px]">
                  <thead>
                    <tr className="text-left text-xs text-muted">
                      <th className="px-1.5 py-1 font-medium">Price</th>
                      <th className="px-1.5 py-1 font-medium">Received</th>
                      <th className="px-1.5 py-1 text-right font-medium">On hand</th>
                    </tr>
                  </thead>
                  <tbody className="font-mono">
                    {selected.batches.map((b) => (
                      <tr key={b.id} className="border-t border-[#ece9e2]">
                        <td className="px-1.5 py-1.5">{paisaToRupeesText(b.price)}</td>
                        <td className="px-1.5 py-1.5 font-sans">{b.receivedDate.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</td>
                        <td className="px-1.5 py-1.5 text-right">{batchStock.get(b.id) ?? 0}</td>
                      </tr>
                    ))}
                    {selected.batches.length === 0 && (
                      <tr><td colSpan={3} className="px-1.5 py-2 font-sans text-muted">No stock received yet.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>
      </div>
    </>
  );
}
