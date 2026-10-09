import Link from "next/link";
import { db } from "@/lib/db";
import { categoryPaths } from "@/lib/items";
import { requireUser } from "@/lib/session";
import {
  createCategoryAction,
  createCompanyAction,
  updateCategoryAction,
  updateCompanyAction,
} from "../actions";

export default async function SetupPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireUser("items.edit");
  const { error, done } = await searchParams;
  const [companies, paths, categories, counts] = await Promise.all([
    db.company.findMany({ orderBy: { name: "asc" } }),
    categoryPaths(db),
    db.category.findMany({ select: { id: true, name: true, parentId: true } }),
    db.item.groupBy({ by: ["companyId"], _count: true }),
  ]);
  const itemCount = new Map(counts.map((c) => [c.companyId, c._count]));
  const byId = new Map(categories.map((c) => [c.id, c]));

  return (
    <>
      <div>
        <Link href="/items" className="text-[13px] text-accent">← Items</Link>
        <h1 className="mt-1 text-[22px] font-semibold">Companies and categories</h1>
      </div>
      {typeof error === "string" && <p role="alert" className="card border-danger text-danger">{error}</p>}
      {done && <p role="status" className="card bg-accent-soft text-accent-dark">Saved.</p>}

      <div className="flex flex-wrap items-start gap-4">
        <section aria-label="Companies" className="card flex min-w-0 flex-[1_1_420px] flex-col gap-3">
          <h2 className="text-[15px] font-semibold">Companies <span className="font-normal text-muted">· publishers and manufacturers</span></h2>
          <form action={createCompanyAction} className="flex flex-wrap gap-2">
            <input name="name" placeholder="New company name" aria-label="New company name" required className="input min-w-0 flex-1" />
            <select name="type" aria-label="Type" className="input w-36">
              <option value="PUBLISHER">Publisher</option>
              <option value="MANUFACTURER">Manufacturer</option>
            </select>
            <button className="btn btn-primary">Add</button>
          </form>
          <div className="flex flex-col">
            {companies.map((c) => (
              <form key={c.id} action={updateCompanyAction} className="flex flex-wrap items-center gap-2 border-t border-[#ece9e2] py-2">
                <input type="hidden" name="id" value={c.id} />
                <input name="name" defaultValue={c.name} aria-label={`Name of ${c.name}`} className="input min-w-0 flex-1" />
                <select name="type" defaultValue={c.type} aria-label={`Type of ${c.name}`} className="input w-36">
                  <option value="PUBLISHER">Publisher</option>
                  <option value="MANUFACTURER">Manufacturer</option>
                </select>
                <span className="w-16 text-right font-mono text-sm text-muted">{itemCount.get(c.id) ?? 0}</span>
                <button className="btn">Save</button>
              </form>
            ))}
          </div>
        </section>

        <section aria-label="Categories" className="card flex min-w-0 flex-[1_1_420px] flex-col gap-3">
          <h2 className="text-[15px] font-semibold">Categories <span className="font-normal text-muted">· any depth, used for search and reports</span></h2>
          <form action={createCategoryAction} className="flex flex-wrap gap-2">
            <input name="name" placeholder="New category name" aria-label="New category name" required className="input min-w-0 flex-1" />
            <select name="parentId" aria-label="Inside" className="input w-full sm:w-56">
              <option value="">Top level</option>
              {paths.map((p) => <option key={p.id} value={p.id}>{p.path}</option>)}
            </select>
            <button className="btn btn-primary">Add</button>
          </form>
          <div className="flex flex-col">
            {paths.map((p) => {
              const c = byId.get(p.id)!;
              return (
                <form key={p.id} action={updateCategoryAction} className="flex flex-wrap items-center gap-2 border-t border-[#ece9e2] py-2">
                  <input type="hidden" name="id" value={p.id} />
                  <span className="w-full text-xs text-muted">{p.path}</span>
                  <input name="name" defaultValue={c.name} aria-label={`Name of ${p.path}`} className="input min-w-0 flex-1" />
                  <select name="parentId" defaultValue={c.parentId ?? ""} aria-label={`Inside, for ${p.path}`} className="input w-full sm:w-56">
                    <option value="">Top level</option>
                    {paths.filter((o) => o.id !== p.id).map((o) => <option key={o.id} value={o.id}>{o.path}</option>)}
                  </select>
                  <button className="btn">Save</button>
                </form>
              );
            })}
          </div>
        </section>
      </div>
    </>
  );
}
