import { Prisma } from "@/generated/prisma/client";
import { writeAudit } from "./audit";
import type { Db } from "./db-types";
import { type BookRule, type PriceMode, type PricedLine, priceLine } from "./pricing";

export type Result<T = undefined> = { ok: true; value: T } | { ok: false; error: string };
const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });
const blank = (v?: string | null) => (v && v.trim() ? v.trim() : null);

// ───────────── Client codes ─────────────
// Like item codes: letters and numbers, up to 12, not case-sensitive. Old codes (such as 64)
// are kept; a number is given automatically only when the code is left blank.

const CODE_FORMAT = /^[A-Za-z0-9]{1,12}$/;
export const clientCodeKey = (code: string) => code.toLowerCase();

export async function checkClientCode(db: Db, code: string, clientId?: number): Promise<string | null> {
  if (!CODE_FORMAT.test(code)) return "Client code: letters and numbers only, up to 12 characters (for example 64).";
  const owner = await db.client.findUnique({ where: { codeKey: clientCodeKey(code) }, select: { id: true, name: true } });
  if (owner && owner.id !== clientId) return `The client code ${code} is already used by "${owner.name}".`;
  return null;
}

// Plain numbers continuing after the highest number already in use.
export async function nextClientCode(db: Db): Promise<string> {
  const rows = await db.$queryRaw<{ n: bigint | null }[]>`
    SELECT MAX("code"::bigint) AS n FROM "clients" WHERE "code" ~ '^[0-9]{1,11}$'`;
  let n = Number(rows[0]?.n ?? 0) + 1;
  while ((await checkClientCode(db, String(n))) !== null) n++;
  return String(n);
}

// ───────────── Clients ─────────────

export type ClientInput = {
  code?: string;
  name: string;
  type?: "RETAIL" | "WHOLESALE" | "SCHOOL" | "SUB_DEALER";
  contactPerson?: string;
  mobile?: string;
  whatsapp?: string;
  phone2?: string;
  email?: string;
  address?: string;
  area?: string;
  city?: string;
  mapLink?: string;
  deliveryAddress?: string;
  cnic?: string;
  ntn?: string;
  salesman?: string;
  referredBy?: string;
  linkedSchools?: string;
  notes?: string;
  creditLimit?: number; // paisa
  termsDays?: number;
  overLimitAction?: "WARN" | "BLOCK";
  sendInvoices?: boolean;
  sendReminders?: boolean;
  notifyArrivals?: boolean;
  messageLanguage?: "EN" | "UR";
};

const TEXT_FIELDS = [
  "contactPerson", "mobile", "whatsapp", "phone2", "email", "address", "area", "city", "mapLink",
  "deliveryAddress", "cnic", "ntn", "salesman", "referredBy", "linkedSchools", "notes",
] as const;

function clientData(input: ClientInput) {
  const data: Record<string, unknown> = { name: input.name.trim() };
  for (const f of TEXT_FIELDS) data[f] = blank(input[f]);
  if (input.type) data.type = input.type;
  if (input.creditLimit !== undefined) data.creditLimit = input.creditLimit;
  if (input.termsDays !== undefined) data.termsDays = input.termsDays;
  for (const f of ["overLimitAction", "sendInvoices", "sendReminders", "notifyArrivals", "messageLanguage"] as const) {
    if (input[f] !== undefined) data[f] = input[f];
  }
  return data as Prisma.ClientUncheckedCreateInput;
}

function validateClient(input: ClientInput): string | null {
  if (!input.name.trim()) return "Enter the client or business name.";
  if (input.creditLimit !== undefined && (!Number.isInteger(input.creditLimit) || input.creditLimit < 0)) return "Enter a valid credit limit.";
  if (input.termsDays !== undefined && (!Number.isInteger(input.termsDays) || input.termsDays < 0 || input.termsDays > 3650)) {
    return "Payment terms must be a number of days.";
  }
  return null;
}

// openingBalance: paisa, positive = they owe us, negative = we owe them. Becomes an OPENING ledger row.
export async function createClient(
  db: Db,
  actorId: number,
  input: ClientInput,
  opts: { openingBalance?: number; copyDiscountsFromClientId?: number | null } = {},
): Promise<Result<{ id: number; code: string }>> {
  const problem = validateClient(input);
  if (problem) return fail(problem);
  const typed = blank(input.code);
  if (typed) {
    const err = await checkClientCode(db, typed);
    if (err) return fail(err);
  }
  const opening = opts.openingBalance ?? 0;
  if (!Number.isInteger(opening)) return fail("Enter a valid opening balance.");
  if (opts.copyDiscountsFromClientId && !(await db.client.findUnique({ where: { id: opts.copyDiscountsFromClientId } }))) {
    return fail("The client to copy discounts from was not found.");
  }

  const code = typed ?? (await nextClientCode(db));
  const client = await db.client.create({ data: { ...clientData(input), code, codeKey: clientCodeKey(code) } });
  if (opening !== 0) {
    await db.ledgerEntry.create({
      data: {
        partyType: "CLIENT",
        clientId: client.id,
        debit: opening > 0 ? opening : 0,
        credit: opening < 0 ? -opening : 0,
        docType: "OPENING",
        note: "Opening balance",
        userId: actorId,
      },
    });
  }
  await writeAudit(db, {
    userId: actorId,
    tableName: "clients",
    recordId: client.id,
    action: "create",
    newValue: { code, name: client.name, type: client.type, openingBalance: opening },
  });
  if (opts.copyDiscountsFromClientId) await copyRules(db, actorId, opts.copyDiscountsFromClientId, client.id);
  return { ok: true, value: { id: client.id, code } };
}

export async function updateClient(db: Db, actorId: number, id: number, input: ClientInput): Promise<Result> {
  const existing = await db.client.findUnique({ where: { id } });
  if (!existing) return fail("Client not found.");
  const problem = validateClient(input);
  if (problem) return fail(problem);
  const code = blank(input.code) ?? existing.code;
  if (code !== existing.code) {
    const err = await checkClientCode(db, code, id);
    if (err) return fail(err);
  }
  const data = { ...clientData(input), code, codeKey: clientCodeKey(code) };
  const oldValue: Record<string, unknown> = {};
  const newValue: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) {
    const before = (existing as Record<string, unknown>)[k];
    if (k !== "codeKey" && before !== v) {
      oldValue[k] = before;
      newValue[k] = v;
    }
  }
  if (Object.keys(newValue).length === 0) return { ok: true, value: undefined };
  await db.client.update({ where: { id }, data });
  await writeAudit(db, {
    userId: actorId,
    tableName: "clients",
    recordId: id,
    action: "update",
    oldValue: oldValue as Prisma.InputJsonValue,
    newValue: newValue as Prisma.InputJsonValue,
  });
  return { ok: true, value: undefined };
}

// Clients are switched off, never deleted.
export async function setClientActive(db: Db, actorId: number, id: number, active: boolean): Promise<Result> {
  const c = await db.client.findUnique({ where: { id } });
  if (!c) return fail("Client not found.");
  if (c.active === active) return { ok: true, value: undefined };
  await db.client.update({ where: { id }, data: { active } });
  await writeAudit(db, { userId: actorId, tableName: "clients", recordId: id, action: active ? "activated" : "deactivated", oldValue: { active: c.active }, newValue: { active } });
  return { ok: true, value: undefined };
}

// They owe us: positive. We owe them (advance, credit): negative.
export async function clientBalance(db: Db, clientId: number): Promise<number> {
  const s = await db.ledgerEntry.aggregate({ where: { clientId, partyType: "CLIENT" }, _sum: { debit: true, credit: true } });
  return (s._sum.debit ?? 0) - (s._sum.credit ?? 0);
}

// ───────────── Company discounts and book rules (PR-02, PR-03) ─────────────

type Source = { billNo?: string | null };

export async function setCompanyDiscount(
  db: Db,
  actorId: number,
  clientId: number,
  companyId: number,
  discountBp: number | null, // null = switch the rule off
  src: Source = {},
): Promise<Result> {
  if (discountBp !== null && (!Number.isInteger(discountBp) || discountBp < 0 || discountBp > 10_000)) return fail("A discount must be from 0% to 100%.");
  const [client, company] = await Promise.all([
    db.client.findUnique({ where: { id: clientId } }),
    db.company.findUnique({ where: { id: companyId } }),
  ]);
  if (!client || !company) return fail("Client or company not found.");
  const existing = await db.clientCompanyDiscount.findUnique({ where: { clientId_companyId: { clientId, companyId } } });

  if (discountBp === null) {
    if (!existing || !existing.active) return { ok: true, value: undefined };
    await db.clientCompanyDiscount.update({ where: { id: existing.id }, data: { active: false, updatedById: actorId, sourceBillNo: src.billNo ?? null } });
    await writeAudit(db, {
      userId: actorId, tableName: "client_company_discounts", recordId: clientId, action: "switch_off",
      oldValue: { company: company.name, discountBp: existing.discountBp }, newValue: { company: company.name, active: false },
    });
    return { ok: true, value: undefined };
  }
  if (existing && existing.active && existing.discountBp === discountBp) return { ok: true, value: undefined };
  await db.clientCompanyDiscount.upsert({
    where: { clientId_companyId: { clientId, companyId } },
    update: { discountBp, active: true, updatedById: actorId, sourceBillNo: src.billNo ?? null },
    create: { clientId, companyId, discountBp, updatedById: actorId, sourceBillNo: src.billNo ?? null },
  });
  await writeAudit(db, {
    userId: actorId, tableName: "client_company_discounts", recordId: clientId, action: existing ? "update" : "create",
    oldValue: existing ? { company: company.name, discountBp: existing.active ? existing.discountBp : null } : undefined,
    newValue: { company: company.name, discountBp, ...(src.billNo ? { bill: src.billNo } : {}) },
  });
  return { ok: true, value: undefined };
}

export async function setBookRule(
  db: Db,
  actorId: number,
  clientId: number,
  itemId: number,
  rule: { specialPrice: number | null; discountBp: number | null },
  src: Source = {},
): Promise<Result> {
  if (rule.specialPrice === null && rule.discountBp === null) return fail("Give a special price, a discount, or both.");
  if (rule.specialPrice !== null && (!Number.isInteger(rule.specialPrice) || rule.specialPrice < 0)) return fail("Enter a valid special price.");
  if (rule.discountBp !== null && (!Number.isInteger(rule.discountBp) || rule.discountBp < 0 || rule.discountBp > 10_000)) return fail("A discount must be from 0% to 100%.");
  const [client, item] = await Promise.all([
    db.client.findUnique({ where: { id: clientId } }),
    db.item.findUnique({ where: { id: itemId } }),
  ]);
  if (!client || !item) return fail("Client or item not found.");
  const existing = await db.clientItemRule.findUnique({ where: { clientId_itemId: { clientId, itemId } } });
  if (existing && existing.active && existing.specialPrice === rule.specialPrice && existing.discountBp === rule.discountBp) {
    return { ok: true, value: undefined };
  }
  const data = {
    specialPrice: rule.specialPrice,
    discountBp: rule.discountBp,
    active: true,
    sourceBillNo: src.billNo ?? null,
    setById: actorId,
    setAt: new Date(),
  };
  await db.clientItemRule.upsert({
    where: { clientId_itemId: { clientId, itemId } },
    update: data,
    create: { clientId, itemId, ...data },
  });
  await writeAudit(db, {
    userId: actorId, tableName: "client_item_rules", recordId: clientId, action: existing ? "update" : "create",
    oldValue: existing ? { item: item.code, specialPrice: existing.specialPrice, discountBp: existing.discountBp, active: existing.active } : undefined,
    newValue: { item: item.code, specialPrice: rule.specialPrice, discountBp: rule.discountBp, ...(src.billNo ? { bill: src.billNo } : {}) },
  });
  return { ok: true, value: undefined };
}

// Switch a book rule off (or back on). Never deleted, so the history stays.
export async function setBookRuleActive(db: Db, actorId: number, clientId: number, itemId: number, active: boolean): Promise<Result> {
  const rule = await db.clientItemRule.findUnique({ where: { clientId_itemId: { clientId, itemId } }, include: { item: true } });
  if (!rule) return fail("Rule not found.");
  if (rule.active === active) return { ok: true, value: undefined };
  await db.clientItemRule.update({ where: { id: rule.id }, data: { active, setById: actorId, setAt: new Date() } });
  await writeAudit(db, {
    userId: actorId, tableName: "client_item_rules", recordId: clientId, action: active ? "switch_on" : "switch_off",
    oldValue: { item: rule.item.code, active: rule.active }, newValue: { item: rule.item.code, active },
  });
  return { ok: true, value: undefined };
}

// PR-11: copy another client's active company discounts and book rules onto this client.
export async function copyRules(db: Db, actorId: number, fromClientId: number, toClientId: number): Promise<Result<{ companies: number; books: number }>> {
  if (fromClientId === toClientId) return fail("Choose a different client to copy from.");
  const [companies, books] = await Promise.all([
    db.clientCompanyDiscount.findMany({ where: { clientId: fromClientId, active: true } }),
    db.clientItemRule.findMany({ where: { clientId: fromClientId, active: true } }),
  ]);
  for (const c of companies) {
    const r = await setCompanyDiscount(db, actorId, toClientId, c.companyId, c.discountBp);
    if (!r.ok) return r;
  }
  for (const b of books) {
    const r = await setBookRule(db, actorId, toClientId, b.itemId, { specialPrice: b.specialPrice, discountBp: b.discountBp });
    if (!r.ok) return r;
  }
  await writeAudit(db, {
    userId: actorId, tableName: "clients", recordId: toClientId, action: "copy_discounts",
    newValue: { fromClientId, companies: companies.length, books: books.length },
  });
  return { ok: true, value: { companies: companies.length, books: books.length } };
}

// Everything that changed in a client's discounts, newest first (read from the audit log).
export async function ruleHistory(db: Db, clientId: number, take = 100) {
  const rows = await db.auditLog.findMany({
    where: { recordId: String(clientId), tableName: { in: ["client_company_discounts", "client_item_rules"] } },
    orderBy: { id: "desc" },
    take,
  });
  const users = await db.user.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.userId).filter((x): x is number => x !== null))] } }, select: { id: true, name: true } });
  const names = new Map(users.map((u) => [u.id, u.name]));
  return rows.map((r) => ({ ...r, userName: r.userId ? (names.get(r.userId) ?? "") : "" }));
}

// ───────────── Quoting lines for a client (used by billing and "check a price") ─────────────

export type QuoteLineInput = { itemId: number; qty: number; unitFactor?: number; basePrice?: number };

// One read per kind of data for the whole bill, then the pure price function for each line.
// clientId null = a walk-in (base price, no rules).
export async function quoteLines(
  db: Db,
  clientId: number | null,
  lines: QuoteLineInput[],
  mode: PriceMode = "RULES",
): Promise<PricedLine[]> {
  if (lines.length === 0) return [];
  const itemIds = [...new Set(lines.map((l) => l.itemId))];
  const items = await db.item.findMany({ where: { id: { in: itemIds } }, select: { id: true, companyId: true, basePrice: true } });
  const itemById = new Map(items.map((i) => [i.id, i]));

  const bookRules = new Map<number, BookRule>();
  const companyRules = new Map<number, number>();
  const lastSale = new Map<number, number>();
  if (clientId !== null && mode !== "BASE") {
    const [books, companies] = await Promise.all([
      db.clientItemRule.findMany({ where: { clientId, itemId: { in: itemIds }, active: true } }),
      db.clientCompanyDiscount.findMany({ where: { clientId, companyId: { in: items.map((i) => i.companyId) }, active: true } }),
    ]);
    for (const b of books) bookRules.set(b.itemId, { specialPrice: b.specialPrice, discountBp: b.discountBp });
    for (const c of companies) companyRules.set(c.companyId, c.discountBp);
    if (mode === "LAST_SALE") {
      const rows = await db.$queryRaw<{ itemId: number; discountBp: number }[]>`
        SELECT DISTINCT ON (sl."itemId") sl."itemId", sl."discountBp"
        FROM "sale_lines" sl JOIN "sales" s ON s."id" = sl."saleId"
        WHERE s."clientId" = ${clientId} AND s."status" = 'ACTIVE' AND sl."itemId" IN (${Prisma.join(itemIds)})
        ORDER BY sl."itemId", s."createdAt" DESC, s."id" DESC`;
      for (const r of rows) lastSale.set(r.itemId, r.discountBp);
    }
  }

  return lines.map((l) => {
    const item = itemById.get(l.itemId);
    if (!item) throw new Error(`Item ${l.itemId} not found`);
    return priceLine({
      basePrice: l.basePrice ?? item.basePrice,
      qty: l.qty,
      unitFactor: l.unitFactor,
      mode,
      bookRule: bookRules.get(l.itemId) ?? null,
      companyDiscountBp: companyRules.get(item.companyId) ?? null,
      lastSaleDiscountBp: lastSale.get(l.itemId) ?? null,
    });
  });
}

// ───────────── The save tick on a bill line (build plan, money tests 5 and 6) ─────────────

// The cashier added a line and may have changed its price or discount. With the tick ON, the
// change is saved as the client's book rule right away, with no question asked. With it OFF,
// nothing is saved. Prices here are per base unit; `finalPrice` is the price per chosen unit.
export async function saveRuleFromBillLine(
  db: Db,
  actorId: number,
  args: {
    clientId: number;
    itemId: number;
    unitFactor?: number;
    finalPrice: number; // paisa per chosen unit, as it stands on the line
    finalDiscountBp: number;
    billNo?: string | null;
    tick: boolean;
  },
): Promise<Result<{ saved: boolean }>> {
  if (!args.tick) return { ok: true, value: { saved: false } };
  const factor = args.unitFactor ?? 1;
  const [quoted] = await quoteLines(db, args.clientId, [{ itemId: args.itemId, qty: 1, unitFactor: factor }], "RULES");
  if (quoted.price === args.finalPrice && quoted.discountBp === args.finalDiscountBp) return { ok: true, value: { saved: false } };

  const item = await db.item.findUnique({ where: { id: args.itemId } });
  if (!item) return fail("Item not found.");
  const perBase = Math.floor((2 * args.finalPrice + factor) / (2 * factor)); // half up
  const result = await setBookRule(
    db,
    actorId,
    args.clientId,
    args.itemId,
    { specialPrice: perBase !== item.basePrice ? perBase : null, discountBp: args.finalDiscountBp },
    { billNo: args.billNo },
  );
  if (!result.ok) return result;
  return { ok: true, value: { saved: true } };
}
