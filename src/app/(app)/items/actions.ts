"use server";

import { redirect } from "next/navigation";
import { can } from "@/lib/auth-core";
import { db, transact } from "@/lib/db";
import {
  addBarcode,
  createCategory,
  createCompany,
  createItem,
  removeBarcode,
  setUnits,
  updateCategory,
  updateCompany,
  updateItem,
  type ItemInput,
  type Result,
} from "@/lib/items";
import { rupeesToPaisa } from "@/lib/money";
import { requireUser } from "@/lib/session";

const text = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

function go(path: string, result: Result<unknown>): never {
  const sep = path.includes("?") ? "&" : "?";
  redirect(result.ok ? `${path}${sep}done=1` : `${path}${sep}error=${encodeURIComponent(result.error)}`);
}

type Unit = { unitName: string; factor: number };

// "dozen = 12" on each line
function parseUnits(raw: string): { units: Unit[] } | { error: string } {
  const units: Unit[] = [];
  for (const line of raw.split("\n").map((l) => l.trim()).filter(Boolean)) {
    const m = /^(.+?)\s*[=:]\s*(\d+)$/.exec(line);
    if (!m) return { error: `Larger units: write each one like "dozen = 12". Problem line: "${line}"` };
    units.push({ unitName: m[1], factor: Number(m[2]) });
  }
  return { units };
}

// Turns the form boxes into an ItemInput. Prices are typed in rupees and converted once, here.
async function readItemForm(
  f: FormData,
): Promise<{ error: string } | { input: ItemInput; extraBarcodes: string[]; units: Unit[] }> {
  const price = rupeesToPaisa(text(f, "basePrice"));
  if (price === null) return { error: "Base price: enter an amount like 850 or 850.50." };
  let cost: number | undefined;
  if (text(f, "costPrice")) {
    const c = rupeesToPaisa(text(f, "costPrice"));
    if (c === null) return { error: "Average cost: enter an amount like 552 or 552.50." };
    cost = c;
  }
  const minRaw = text(f, "minStock");
  if (minRaw && !/^\d{1,9}$/.test(minRaw)) return { error: "Minimum stock must be a whole number." };

  const company = await db.company.findFirst({ where: { name: { equals: text(f, "company"), mode: "insensitive" } } });
  if (!company) return { error: "Choose the company from the list. Add it under Companies and categories if it is new." };

  const units = parseUnits(text(f, "units"));
  if ("error" in units) return units;

  return {
    input: {
      name: text(f, "name"),
      nameUrdu: text(f, "nameUrdu"),
      searchSpelling: text(f, "searchSpelling"),
      code: text(f, "code"),
      isbn: text(f, "isbn"),
      author: text(f, "author"),
      subject: text(f, "subject"),
      language: text(f, "language"),
      classGrade: text(f, "classGrade"),
      companyId: company.id,
      categoryId: text(f, "categoryId") ? Number(text(f, "categoryId")) : null,
      basePrice: price,
      costPrice: cost,
      baseUnit: text(f, "baseUnit") || "piece",
      minStock: minRaw ? Number(minRaw) : 0,
      status: (text(f, "status") || "ACTIVE") as ItemInput["status"],
    },
    extraBarcodes: text(f, "extraBarcodes").split(/[,\n]/).map((s) => s.trim()).filter(Boolean),
    units: units.units,
  };
}

export async function createItemAction(formData: FormData) {
  const user = await requireUser("items.edit");
  const form = await readItemForm(formData);
  if ("error" in form) redirect(`/items/new?error=${encodeURIComponent(form.error)}`);
  const result = await transact((tx) =>
    createItem(tx, user.id, { ...form.input, extraBarcodes: form.extraBarcodes, units: form.units }, { canSetCost: can(user, "cost.view") }),
  );
  if (!result.ok) redirect(`/items/new?error=${encodeURIComponent(result.error)}`);
  redirect(`/items?id=${result.value.id}&done=1`);
}

export async function updateItemAction(formData: FormData) {
  const user = await requireUser("items.edit");
  const id = Number(formData.get("id"));
  const form = await readItemForm(formData);
  if ("error" in form) redirect(`/items?id=${id}&error=${encodeURIComponent(form.error)}`);
  const result = await transact((tx) => updateItem(tx, user.id, id, form.input, { canSetCost: can(user, "cost.view") }));
  go(`/items?id=${id}`, result);
}

export async function addBarcodeAction(formData: FormData) {
  const user = await requireUser("items.edit");
  const id = Number(formData.get("id"));
  go(`/items?id=${id}`, await transact((tx) => addBarcode(tx, user.id, id, text(formData, "barcode"))));
}

export async function removeBarcodeAction(formData: FormData) {
  const user = await requireUser("items.edit");
  const id = Number(formData.get("id"));
  go(`/items?id=${id}`, await transact((tx) => removeBarcode(tx, user.id, id, text(formData, "barcode"))));
}

export async function setUnitsAction(formData: FormData) {
  const user = await requireUser("items.edit");
  const id = Number(formData.get("id"));
  const parsed = parseUnits(text(formData, "units"));
  if ("error" in parsed) redirect(`/items?id=${id}&error=${encodeURIComponent(parsed.error)}`);
  go(`/items?id=${id}`, await transact((tx) => setUnits(tx, user.id, id, parsed.units)));
}

const companyType = (f: FormData) => (text(f, "type") === "MANUFACTURER" ? "MANUFACTURER" : "PUBLISHER");

export async function createCompanyAction(formData: FormData) {
  const user = await requireUser("items.edit");
  go("/items/setup", await transact((tx) => createCompany(tx, user.id, text(formData, "name"), companyType(formData))));
}

export async function updateCompanyAction(formData: FormData) {
  const user = await requireUser("items.edit");
  go("/items/setup", await transact((tx) => updateCompany(tx, user.id, Number(formData.get("id")), text(formData, "name"), companyType(formData))));
}

export async function createCategoryAction(formData: FormData) {
  const user = await requireUser("items.edit");
  const parent = text(formData, "parentId");
  go("/items/setup", await transact((tx) => createCategory(tx, user.id, text(formData, "name"), parent ? Number(parent) : null)));
}

export async function updateCategoryAction(formData: FormData) {
  const user = await requireUser("items.edit");
  const parent = text(formData, "parentId");
  go("/items/setup", await transact((tx) => updateCategory(tx, user.id, Number(formData.get("id")), text(formData, "name"), parent ? Number(parent) : null)));
}
