import Link from "next/link";
import { can } from "@/lib/auth-core";
import { db } from "@/lib/db";
import { categoryPaths } from "@/lib/items";
import { requireUser } from "@/lib/session";
import { createItemAction } from "../actions";
import { ItemForm } from "../item-form";

export default async function NewItemPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser("items.edit");
  const { error } = await searchParams;
  const [companies, categories] = await Promise.all([
    db.company.findMany({ orderBy: { name: "asc" }, select: { name: true } }),
    categoryPaths(db),
  ]);
  return (
    <>
      <div>
        <Link href="/items" className="text-[13px] text-accent">← Items</Link>
        <h1 className="mt-1 text-[22px] font-semibold">New item</h1>
      </div>
      {typeof error === "string" && <p role="alert" className="card border-danger text-danger">{error}</p>}
      <section className="card max-w-3xl">
        <ItemForm
          companies={companies.map((c) => c.name)}
          categories={categories}
          canSeeCost={can(user, "cost.view")}
          action={createItemAction}
          submitLabel="Save item"
        />
      </section>
    </>
  );
}
