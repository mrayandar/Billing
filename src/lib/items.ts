import type { Prisma } from "@/generated/prisma/client";
import { writeAudit } from "./audit";
import type { Db } from "./db-types";

export type Result<T = undefined> = { ok: true; value: T } | { ok: false; error: string };
const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });

// ───────────── Codes and barcodes ─────────────
// The cashier types item codes and scans barcodes into the same field, so a short code and
// a barcode must never be the same text on two different items. A code is also never reused.

const CODE_FORMAT = /^[A-Za-z0-9._-]{1,20}$/;
const BARCODE_FORMAT = /^[^\s]{3,64}$/;

// What already owns this exact text as a code, a code in the past, a barcode or a batch barcode.
async function whoOwnsText(db: Db, text: string) {
  const [item, oldCode, barcode, batch] = await Promise.all([
    db.item.findUnique({ where: { code: text }, select: { id: true, name: true } }),
    db.itemCode.findUnique({ where: { code: text } }),
    db.itemBarcode.findUnique({ where: { barcode: text }, include: { item: { select: { id: true, name: true } } } }),
    db.itemBatch.findUnique({ where: { barcode: text }, include: { item: { select: { id: true, name: true } } } }),
  ]);
  return {
    asCode: item,
    asOldCodeOfItemId: oldCode?.itemId ?? null,
    asBarcode: barcode?.item ?? null,
    asBatchBarcode: batch?.item ?? null,
  };
}

// Returns an error message, or null when the code is free to use for this item.
export async function checkCode(db: Db, code: string, itemId?: number): Promise<string | null> {
  if (!CODE_FORMAT.test(code)) return "Item code: 1-20 letters, numbers, dot, dash or underscore, no spaces.";
  const o = await whoOwnsText(db, code);
  if (o.asCode && o.asCode.id !== itemId) return `The code ${code} is already used by "${o.asCode.name}".`;
  if (o.asOldCodeOfItemId !== null && o.asOldCodeOfItemId !== itemId) {
    return `The code ${code} was used before and is never reused.`;
  }
  if (o.asBarcode && o.asBarcode.id !== itemId) {
    return `The code ${code} is the barcode of "${o.asBarcode.name}". A code must not match any barcode.`;
  }
  if (o.asBatchBarcode && o.asBatchBarcode.id !== itemId) {
    return `The code ${code} is a batch barcode of "${o.asBatchBarcode.name}". A code must not match any barcode.`;
  }
  return null;
}

export async function checkBarcode(db: Db, barcode: string, itemId?: number): Promise<string | null> {
  if (!BARCODE_FORMAT.test(barcode)) return "A barcode needs 3 to 64 characters with no spaces.";
  const o = await whoOwnsText(db, barcode);
  if (o.asBarcode) {
    return o.asBarcode.id === itemId
      ? `This item already has the barcode ${barcode}.`
      : `The barcode ${barcode} already belongs to "${o.asBarcode.name}".`;
  }
  if (o.asBatchBarcode) return `The barcode ${barcode} is a batch barcode of "${o.asBatchBarcode.name}".`;
  if (o.asCode && o.asCode.id !== itemId) {
    return `The barcode ${barcode} is the item code of "${o.asCode.name}". A barcode must not match any item code.`;
  }
  if (o.asOldCodeOfItemId !== null && o.asOldCodeOfItemId !== itemId) {
    return `The barcode ${barcode} was an item code before and cannot be reused.`;
  }
  return null;
}

// Next plain running number (1001, 1002, ...). The database sequence never goes back, so a
// number is never handed out twice. Numbers that were typed in by hand are skipped.
export async function nextItemCode(db: Db): Promise<string> {
  for (let i = 0; i < 10_000; i++) {
    const rows = await db.$queryRaw<{ n: bigint }[]>`SELECT nextval('item_code_seq') AS n`;
    const code = String(rows[0].n);
    if ((await checkCode(db, code)) === null) return code;
  }
  throw new Error("Could not find a free item code.");
}

// Exact code, barcode or ISBN typed or scanned in the code field (BE-02, BE-06).
export async function findItemByCodeOrBarcode(db: Db, text: string) {
  const t = text.trim();
  if (!t) return null;
  const byCode = await db.item.findUnique({ where: { code: t } });
  if (byCode) return byCode;
  const byBarcode = await db.itemBarcode.findUnique({ where: { barcode: t }, include: { item: true } });
  if (byBarcode) return byBarcode.item;
  const byBatch = await db.itemBatch.findUnique({ where: { barcode: t }, include: { item: true } });
  if (byBatch) return byBatch.item;
  return db.item.findFirst({ where: { isbn: t } });
}

// ───────────── Items ─────────────

export type ItemInput = {
  name: string;
  nameUrdu?: string;
  searchSpelling?: string;
  code?: string; // empty on a new item = next running number
  isbn?: string;
  author?: string;
  subject?: string;
  language?: string;
  classGrade?: string;
  companyId: number;
  categoryId?: number | null;
  basePrice: number; // paisa
  costPrice?: number; // paisa; only applied when the user may see cost
  baseUnit?: string;
  minStock?: number;
  status?: "ACTIVE" | "INACTIVE" | "OLD_EDITION" | "DISCONTINUED";
};

const blank = (v?: string | null) => (v && v.trim() ? v.trim() : null);

async function validateItemInput(db: Db, input: ItemInput): Promise<string | null> {
  if (!input.name.trim()) return "Enter the item name.";
  if (!Number.isInteger(input.basePrice) || input.basePrice < 0) return "Enter a valid base price.";
  if (input.costPrice !== undefined && (!Number.isInteger(input.costPrice) || input.costPrice < 0)) {
    return "Enter a valid cost price.";
  }
  if (input.minStock !== undefined && (!Number.isInteger(input.minStock) || input.minStock < 0)) {
    return "Minimum stock must be a whole number.";
  }
  if (!(await db.company.findUnique({ where: { id: input.companyId } }))) return "Choose a company from the list.";
  if (input.categoryId && !(await db.category.findUnique({ where: { id: input.categoryId } }))) {
    return "Choose a category from the list.";
  }
  return null;
}

export async function createItem(
  db: Db,
  actorId: number,
  input: ItemInput & { extraBarcodes?: string[]; units?: { unitName: string; factor: number }[] },
  opts: { canSetCost: boolean },
): Promise<Result<{ id: number; code: string }>> {
  const problem = await validateItemInput(db, input);
  if (problem) return fail(problem);

  const typedCode = blank(input.code);
  if (typedCode) {
    const codeProblem = await checkCode(db, typedCode);
    if (codeProblem) return fail(codeProblem);
  }
  const code = typedCode ?? (await nextItemCode(db));

  // Barcodes: the shop code, the ISBN, then any extras — each checked for clashes.
  const barcodes: { barcode: string; label: string }[] = [{ barcode: code, label: "shop code" }];
  const isbn = blank(input.isbn);
  if (isbn && isbn !== code) barcodes.push({ barcode: isbn, label: "ISBN" });
  for (const b of input.extraBarcodes ?? []) {
    const t = b.trim();
    if (t && !barcodes.some((x) => x.barcode === t)) barcodes.push({ barcode: t, label: "maker" });
  }
  for (const b of barcodes) {
    if (b.barcode === code) continue; // the shop code is this item's own code
    const err = await checkBarcode(db, b.barcode);
    if (err) return fail(err);
  }
  const unitsError = validateUnits(input.baseUnit ?? "piece", input.units ?? []);
  if (unitsError) return fail(unitsError);

  const item = await db.item.create({
    data: {
      code,
      name: input.name.trim(),
      nameUrdu: blank(input.nameUrdu),
      searchSpelling: blank(input.searchSpelling),
      isbn,
      author: blank(input.author),
      subject: blank(input.subject),
      language: blank(input.language),
      classGrade: blank(input.classGrade),
      companyId: input.companyId,
      categoryId: input.categoryId ?? null,
      basePrice: input.basePrice,
      costPrice: opts.canSetCost ? (input.costPrice ?? 0) : 0,
      baseUnit: blank(input.baseUnit) ?? "piece",
      minStock: input.minStock ?? 0,
      status: input.status ?? "ACTIVE",
      barcodes: { create: barcodes },
      units: { create: (input.units ?? []).map((u) => ({ unitName: u.unitName.trim(), factor: u.factor })) },
    },
  });
  await db.itemCode.create({ data: { code, itemId: item.id } });
  await writeAudit(db, {
    userId: actorId,
    tableName: "items",
    recordId: item.id,
    action: "create",
    newValue: { code, name: item.name, basePrice: item.basePrice, companyId: item.companyId },
  });
  return { ok: true, value: { id: item.id, code } };
}

const TRACKED = [
  "name", "nameUrdu", "searchSpelling", "code", "isbn", "author", "subject", "language", "classGrade",
  "companyId", "categoryId", "basePrice", "costPrice", "baseUnit", "minStock", "status",
] as const;

export async function updateItem(
  db: Db,
  actorId: number,
  id: number,
  input: ItemInput,
  opts: { canSetCost: boolean },
): Promise<Result> {
  const existing = await db.item.findUnique({ where: { id } });
  if (!existing) return fail("Item not found.");
  const problem = await validateItemInput(db, input);
  if (problem) return fail(problem);

  const code = blank(input.code) ?? existing.code;
  if (code !== existing.code) {
    const err = await checkCode(db, code, id);
    if (err) return fail(err);
  }
  const isbn = blank(input.isbn);
  if (isbn && isbn !== existing.isbn) {
    const owner = await db.itemBarcode.findUnique({ where: { barcode: isbn } });
    if (owner && owner.itemId !== id) return fail((await checkBarcode(db, isbn, id)) ?? "That ISBN is already a barcode.");
    const asCode = await db.item.findUnique({ where: { code: isbn } });
    if (asCode && asCode.id !== id) return fail(`The ISBN ${isbn} is the item code of "${asCode.name}".`);
  }

  const next = {
    name: input.name.trim(),
    nameUrdu: blank(input.nameUrdu),
    searchSpelling: blank(input.searchSpelling),
    code,
    isbn,
    author: blank(input.author),
    subject: blank(input.subject),
    language: blank(input.language),
    classGrade: blank(input.classGrade),
    companyId: input.companyId,
    categoryId: input.categoryId ?? null,
    basePrice: input.basePrice,
    costPrice: opts.canSetCost && input.costPrice !== undefined ? input.costPrice : existing.costPrice,
    baseUnit: blank(input.baseUnit) ?? existing.baseUnit,
    minStock: input.minStock ?? existing.minStock,
    status: input.status ?? existing.status,
  };
  const oldValue: Record<string, unknown> = {};
  const newValue: Record<string, unknown> = {};
  for (const k of TRACKED) {
    if (existing[k] !== next[k]) {
      oldValue[k] = existing[k];
      newValue[k] = next[k];
    }
  }
  if (Object.keys(newValue).length === 0) return { ok: true, value: undefined };

  await db.item.update({ where: { id }, data: next });
  if (code !== existing.code) await db.itemCode.create({ data: { code, itemId: id } });
  if (isbn && isbn !== existing.isbn && !(await db.itemBarcode.findUnique({ where: { barcode: isbn } }))) {
    await db.itemBarcode.create({ data: { itemId: id, barcode: isbn, label: "ISBN" } });
  }
  await writeAudit(db, {
    userId: actorId,
    tableName: "items",
    recordId: id,
    action: "update",
    oldValue: oldValue as Prisma.InputJsonValue,
    newValue: newValue as Prisma.InputJsonValue,
  });
  return { ok: true, value: undefined };
}

export async function addBarcode(db: Db, actorId: number, itemId: number, barcode: string, label = "maker"): Promise<Result> {
  const t = barcode.trim();
  if (!(await db.item.findUnique({ where: { id: itemId } }))) return fail("Item not found.");
  const err = await checkBarcode(db, t, itemId);
  if (err) return fail(err);
  await db.itemBarcode.create({ data: { itemId, barcode: t, label } });
  await writeAudit(db, { userId: actorId, tableName: "item_barcodes", recordId: itemId, action: "add", newValue: { barcode: t, label } });
  return { ok: true, value: undefined };
}

export async function removeBarcode(db: Db, actorId: number, itemId: number, barcode: string): Promise<Result> {
  const row = await db.itemBarcode.findUnique({ where: { barcode } });
  if (!row || row.itemId !== itemId) return fail("Barcode not found on this item.");
  await db.itemBarcode.delete({ where: { barcode } });
  await writeAudit(db, { userId: actorId, tableName: "item_barcodes", recordId: itemId, action: "remove", oldValue: { barcode, label: row.label } });
  return { ok: true, value: undefined };
}

// ───────────── Units and conversions ─────────────

export function validateUnits(baseUnit: string, units: { unitName: string; factor: number }[]): string | null {
  const seen = new Set<string>([baseUnit.trim().toLowerCase()]);
  for (const u of units) {
    const name = u.unitName.trim().toLowerCase();
    if (!name) return "Give each larger unit a name.";
    if (!Number.isInteger(u.factor) || u.factor < 2) return `"${u.unitName}": the number of ${baseUnit} inside must be a whole number, 2 or more.`;
    if (seen.has(name)) return `The unit "${u.unitName}" is listed twice or is the same as the base unit.`;
    seen.add(name);
  }
  return null;
}

// Replace the list of larger units (dozen, box, carton...). Stock is always kept in the base unit.
export async function setUnits(
  db: Db,
  actorId: number,
  itemId: number,
  units: { unitName: string; factor: number }[],
): Promise<Result> {
  const item = await db.item.findUnique({ where: { id: itemId }, include: { units: true } });
  if (!item) return fail("Item not found.");
  const err = validateUnits(item.baseUnit, units);
  if (err) return fail(err);
  await db.itemUnit.deleteMany({ where: { itemId } });
  await db.itemUnit.createMany({ data: units.map((u) => ({ itemId, unitName: u.unitName.trim(), factor: u.factor })) });
  await writeAudit(db, {
    userId: actorId,
    tableName: "item_units",
    recordId: itemId,
    action: "set",
    oldValue: item.units.map((u) => ({ unit: u.unitName, factor: u.factor })),
    newValue: units.map((u) => ({ unit: u.unitName.trim(), factor: u.factor })),
  });
  return { ok: true, value: undefined };
}

// How many base units are in `qty` of a unit (the base unit itself counts as 1).
export function toBaseUnits(qty: number, factor: number): number {
  return qty * factor;
}

// ───────────── Companies and categories ─────────────

export async function createCompany(db: Db, actorId: number, name: string, type: "PUBLISHER" | "MANUFACTURER"): Promise<Result<number>> {
  const n = name.trim();
  if (!n) return fail("Enter the company name.");
  if (await db.company.findUnique({ where: { name: n } })) return fail("That company already exists.");
  const c = await db.company.create({ data: { name: n, type } });
  await writeAudit(db, { userId: actorId, tableName: "companies", recordId: c.id, action: "create", newValue: { name: n, type } });
  return { ok: true, value: c.id };
}

export async function updateCompany(db: Db, actorId: number, id: number, name: string, type: "PUBLISHER" | "MANUFACTURER"): Promise<Result> {
  const n = name.trim();
  const old = await db.company.findUnique({ where: { id } });
  if (!old) return fail("Company not found.");
  if (!n) return fail("Enter the company name.");
  const clash = await db.company.findUnique({ where: { name: n } });
  if (clash && clash.id !== id) return fail("Another company already has that name.");
  await db.company.update({ where: { id }, data: { name: n, type } });
  await writeAudit(db, {
    userId: actorId,
    tableName: "companies",
    recordId: id,
    action: "update",
    oldValue: { name: old.name, type: old.type },
    newValue: { name: n, type },
  });
  return { ok: true, value: undefined };
}

export async function createCategory(db: Db, actorId: number, name: string, parentId: number | null): Promise<Result<number>> {
  const n = name.trim();
  if (!n) return fail("Enter the category name.");
  if (parentId && !(await db.category.findUnique({ where: { id: parentId } }))) return fail("Parent category not found.");
  if (await db.category.findFirst({ where: { name: { equals: n, mode: "insensitive" }, parentId } })) {
    return fail("There is already a category with that name here.");
  }
  const c = await db.category.create({ data: { name: n, parentId } });
  await writeAudit(db, { userId: actorId, tableName: "categories", recordId: c.id, action: "create", newValue: { name: n, parentId } });
  return { ok: true, value: c.id };
}

// Rename a category and/or move it under another parent (never under itself or its own children).
export async function updateCategory(db: Db, actorId: number, id: number, name: string, parentId: number | null): Promise<Result> {
  const n = name.trim();
  const old = await db.category.findUnique({ where: { id } });
  if (!old) return fail("Category not found.");
  if (!n) return fail("Enter the category name.");
  if (parentId !== null) {
    const all = await db.category.findMany({ select: { id: true, parentId: true } });
    const parentOf = new Map(all.map((c) => [c.id, c.parentId]));
    for (let cur: number | null | undefined = parentId; cur != null; cur = parentOf.get(cur)) {
      if (cur === id) return fail("A category cannot be moved inside itself.");
    }
  }
  const clash = await db.category.findFirst({ where: { name: { equals: n, mode: "insensitive" }, parentId, id: { not: id } } });
  if (clash) return fail("There is already a category with that name here.");
  await db.category.update({ where: { id }, data: { name: n, parentId } });
  await writeAudit(db, {
    userId: actorId,
    tableName: "categories",
    recordId: id,
    action: "update",
    oldValue: { name: old.name, parentId: old.parentId },
    newValue: { name: n, parentId },
  });
  return { ok: true, value: undefined };
}

// "Books › Textbooks › Class 4" for every category, sorted for a drop-down list.
export async function categoryPaths(db: Db): Promise<{ id: number; path: string }[]> {
  const all = await db.category.findMany({ select: { id: true, name: true, parentId: true } });
  const byId = new Map(all.map((c) => [c.id, c]));
  const path = (id: number): string => {
    const parts: string[] = [];
    for (let cur = byId.get(id); cur; cur = cur.parentId ? byId.get(cur.parentId) : undefined) parts.unshift(cur.name);
    return parts.join(" › ");
  };
  return all.map((c) => ({ id: c.id, path: path(c.id) })).sort((a, b) => a.path.localeCompare(b.path));
}

// ───────────── Stock figures (sum of stock_movements) ─────────────

export async function stockByItem(db: Db, itemIds: number[]): Promise<Map<number, number>> {
  if (itemIds.length === 0) return new Map();
  const rows = await db.stockMovement.groupBy({
    by: ["itemId"],
    where: { itemId: { in: itemIds } },
    _sum: { qtyIn: true, qtyOut: true },
  });
  return new Map(rows.map((r) => [r.itemId, (r._sum.qtyIn ?? 0) - (r._sum.qtyOut ?? 0)]));
}

export async function stockByBatch(db: Db, itemId: number): Promise<Map<number, number>> {
  const rows = await db.stockMovement.groupBy({
    by: ["batchId"],
    where: { itemId },
    _sum: { qtyIn: true, qtyOut: true },
  });
  return new Map(rows.filter((r) => r.batchId !== null).map((r) => [r.batchId as number, (r._sum.qtyIn ?? 0) - (r._sum.qtyOut ?? 0)]));
}

// ───────────── Search (PM-08) ─────────────

export type ItemSearch = {
  q?: string;
  companyId?: number;
  categoryId?: number;
  chip?: "active" | "low" | "old" | "all";
  page?: number;
  pageSize?: number;
};

export async function searchItems(db: Db, s: ItemSearch) {
  const pageSize = s.pageSize ?? 25;
  const page = Math.max(1, s.page ?? 1);
  const q = (s.q ?? "").trim();
  const words = q.split(/\s+/).filter(Boolean).slice(0, 6);
  const chip = s.chip ?? "active";

  const and: Prisma.ItemWhereInput[] = [];
  // Every word must match somewhere; each word may match any one field. Partial words work.
  for (const w of words) {
    and.push({
      OR: [
        { code: { startsWith: w, mode: "insensitive" } },
        { name: { contains: w, mode: "insensitive" } },
        { nameUrdu: { contains: w } },
        { searchSpelling: { contains: w, mode: "insensitive" } },
        { author: { contains: w, mode: "insensitive" } },
        { isbn: { contains: w, mode: "insensitive" } },
        { company: { name: { contains: w, mode: "insensitive" } } },
        { barcodes: { some: { barcode: w } } },
      ],
    });
  }
  if (s.companyId) and.push({ companyId: s.companyId });
  if (s.categoryId) {
    // include everything below the chosen category
    const cats = await db.category.findMany({ select: { id: true, parentId: true } });
    const ids = new Set([s.categoryId]);
    for (let grew = true; grew; ) {
      grew = false;
      for (const c of cats) {
        if (c.parentId && ids.has(c.parentId) && !ids.has(c.id)) {
          ids.add(c.id);
          grew = true;
        }
      }
    }
    and.push({ categoryId: { in: [...ids] } });
  }
  if (chip === "active" || chip === "low") and.push({ status: "ACTIVE" });
  if (chip === "old") and.push({ status: { in: ["OLD_EDITION", "DISCONTINUED"] } });
  if (chip === "low") {
    const rows = await db.$queryRaw<{ id: number }[]>`
      SELECT i."id" FROM "items" i
      LEFT JOIN (SELECT "itemId", SUM("qtyIn" - "qtyOut") AS s FROM "stock_movements" GROUP BY "itemId") m ON m."itemId" = i."id"
      WHERE COALESCE(m.s, 0) <= i."minStock"`;
    and.push({ id: { in: rows.map((r) => r.id) } });
  }
  const where: Prisma.ItemWhereInput = and.length ? { AND: and } : {};
  const include = { company: true, category: true } as const;

  const total = await db.item.count({ where });

  // An exact code, barcode or ISBN goes to the top of the first page.
  let exactId: number | null = null;
  if (q && page === 1) {
    const hit = await findItemByCodeOrBarcode(db, q);
    // only when it also passes the chosen filters
    if (hit && (await db.item.count({ where: { AND: [where, { id: hit.id }] } })) > 0) exactId = hit.id;
  }
  const rest = await db.item.findMany({
    where: exactId ? { AND: [where, { id: { not: exactId } }] } : where,
    include,
    orderBy: [{ name: "asc" }, { id: "asc" }],
    skip: (page - 1) * pageSize,
    take: exactId ? pageSize - 1 : pageSize,
  });
  const exact = exactId ? await db.item.findUnique({ where: { id: exactId }, include }) : null;
  const items = exact ? [exact, ...rest] : rest;
  return { items, total, page, pageSize };
}
