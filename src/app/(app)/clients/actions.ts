"use server";

import { redirect } from "next/navigation";
import {
  type ClientInput,
  type Result,
  copyRules,
  createClient,
  setBookRule,
  setBookRuleActive,
  setClientActive,
  setCompanyDiscount,
  updateClient,
} from "@/lib/clients";
import { db, transact } from "@/lib/db";
import { findItemByCodeOrBarcode, searchItems } from "@/lib/items";
import { rupeesToPaisa } from "@/lib/money";
import { percentToBp } from "@/lib/pricing";
import { requireUser } from "@/lib/session";

const text = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

function go(path: string, result: Result<unknown>, done = "1"): never {
  const sep = path.includes("?") ? "&" : "?";
  redirect(result.ok ? `${path}${sep}done=${done}` : `${path}${sep}error=${encodeURIComponent(result.error)}`);
}

function readClientForm(f: FormData): { error: string } | { input: ClientInput; opening: number } {
  const credit = rupeesToPaisa(text(f, "creditLimit") || "0");
  if (credit === null) return { error: "Credit limit: enter an amount like 100000." };
  const terms = text(f, "termsDays") || "0";
  if (!/^\d{1,4}$/.test(terms)) return { error: "Payment terms must be a number of days." };
  let opening = 0;
  if (f.has("openingBalance")) {
    const o = rupeesToPaisa(text(f, "openingBalance") || "0");
    if (o === null) return { error: "Opening balance: enter an amount like 24300." };
    opening = text(f, "openingSide") === "WE_OWE" ? -o : o;
  }
  const type = text(f, "type");
  return {
    opening,
    input: {
      code: text(f, "code"),
      name: text(f, "name"),
      type: (["RETAIL", "WHOLESALE", "SCHOOL", "SUB_DEALER"].includes(type) ? type : "WHOLESALE") as ClientInput["type"],
      contactPerson: text(f, "contactPerson"),
      mobile: text(f, "mobile"),
      whatsapp: text(f, "whatsapp"),
      phone2: text(f, "phone2"),
      email: text(f, "email"),
      address: text(f, "address"),
      area: text(f, "area"),
      city: text(f, "city"),
      mapLink: text(f, "mapLink"),
      deliveryAddress: text(f, "deliveryAddress"),
      cnic: text(f, "cnic"),
      ntn: text(f, "ntn"),
      salesman: text(f, "salesman"),
      referredBy: text(f, "referredBy"),
      linkedSchools: text(f, "linkedSchools"),
      notes: text(f, "notes"),
      creditLimit: credit,
      termsDays: Number(terms),
      overLimitAction: text(f, "overLimitAction") === "BLOCK" ? "BLOCK" : "WARN",
      sendInvoices: f.has("sendInvoices"),
      sendReminders: f.has("sendReminders"),
      notifyArrivals: f.has("notifyArrivals"),
      messageLanguage: text(f, "messageLanguage") === "UR" ? "UR" : "EN",
    },
  };
}

export async function createClientAction(formData: FormData) {
  const user = await requireUser("clients.edit");
  const form = readClientForm(formData);
  if ("error" in form) redirect(`/clients/new?error=${encodeURIComponent(form.error)}`);
  const copy = Number(text(formData, "copyFrom")) || null;
  if (copy) await requireUser("client_rules.edit");
  const result = await transact((tx) =>
    createClient(tx, user.id, form.input, { openingBalance: form.opening, copyDiscountsFromClientId: copy }),
  );
  if (!result.ok) redirect(`/clients/new?error=${encodeURIComponent(result.error)}`);
  redirect(`/clients/${result.value.id}?done=1`);
}

export async function updateClientAction(formData: FormData) {
  const user = await requireUser("clients.edit");
  const id = Number(formData.get("id"));
  const form = readClientForm(formData);
  if ("error" in form) redirect(`/clients/${id}/edit?error=${encodeURIComponent(form.error)}`);
  const result = await transact((tx) => updateClient(tx, user.id, id, form.input));
  if (!result.ok) redirect(`/clients/${id}/edit?error=${encodeURIComponent(result.error)}`);
  redirect(`/clients/${id}?done=1`);
}

export async function setClientActiveAction(formData: FormData) {
  const user = await requireUser("clients.edit");
  const id = Number(formData.get("id"));
  go(`/clients/${id}`, await transact((tx) => setClientActive(tx, user.id, id, formData.get("active") === "true")));
}

// All company discount boxes on the screen at once: d_<companyId> = percent, empty = none.
export async function saveCompanyDiscountsAction(formData: FormData) {
  const user = await requireUser("client_rules.edit");
  const clientId = Number(formData.get("clientId"));
  const entries: { companyId: number; bp: number | null }[] = [];
  for (const [k, v] of formData.entries()) {
    if (!k.startsWith("d_")) continue;
    const raw = String(v).trim();
    if (raw === "") {
      entries.push({ companyId: Number(k.slice(2)), bp: null });
      continue;
    }
    const bp = percentToBp(raw);
    if (bp === null) redirect(`/clients/${clientId}?error=${encodeURIComponent(`"${raw}" is not a valid discount. Use 0 to 100, with up to 2 decimals.`)}`);
    entries.push({ companyId: Number(k.slice(2)), bp });
  }
  const result = await transact(async (tx) => {
    for (const e of entries) {
      const r = await setCompanyDiscount(tx, user.id, clientId, e.companyId, e.bp);
      if (!r.ok) return r;
    }
    return { ok: true as const, value: undefined };
  });
  go(`/clients/${clientId}`, result);
}

function readRule(f: FormData): { error: string } | { specialPrice: number | null; discountBp: number | null } {
  const priceText = text(f, "specialPrice");
  const discText = text(f, "discount");
  let specialPrice: number | null = null;
  let discountBp: number | null = null;
  if (priceText) {
    specialPrice = rupeesToPaisa(priceText);
    if (specialPrice === null) return { error: "Special price: enter an amount like 430." };
  }
  if (discText) {
    discountBp = percentToBp(discText);
    if (discountBp === null) return { error: "Discount: use 0 to 100, with up to 2 decimals." };
  }
  return { specialPrice, discountBp };
}

export async function saveBookRuleAction(formData: FormData) {
  const user = await requireUser("client_rules.edit");
  const clientId = Number(formData.get("clientId"));
  const itemId = Number(formData.get("itemId"));
  const rule = readRule(formData);
  if ("error" in rule) redirect(`/clients/${clientId}?error=${encodeURIComponent(rule.error)}`);
  go(`/clients/${clientId}`, await transact((tx) => setBookRule(tx, user.id, clientId, itemId, rule)));
}

// "Add a book by code or name"
export async function addBookRuleAction(formData: FormData) {
  const user = await requireUser("client_rules.edit");
  const clientId = Number(formData.get("clientId"));
  const q = text(formData, "book");
  const rule = readRule(formData);
  if ("error" in rule) redirect(`/clients/${clientId}?error=${encodeURIComponent(rule.error)}`);
  const item = (await findItemByCodeOrBarcode(db, q)) ?? (await searchItems(db, { q, chip: "all", pageSize: 1 })).items[0];
  if (!item) redirect(`/clients/${clientId}?error=${encodeURIComponent(`No item found for "${q}".`)}`);
  go(`/clients/${clientId}`, await transact((tx) => setBookRule(tx, user.id, clientId, item.id, rule)));
}

export async function toggleBookRuleAction(formData: FormData) {
  const user = await requireUser("client_rules.edit");
  const clientId = Number(formData.get("clientId"));
  const itemId = Number(formData.get("itemId"));
  go(`/clients/${clientId}`, await transact((tx) => setBookRuleActive(tx, user.id, clientId, itemId, formData.get("active") === "true")));
}

export async function copyRulesAction(formData: FormData) {
  const user = await requireUser("client_rules.edit");
  const clientId = Number(formData.get("clientId"));
  const from = Number(formData.get("fromClientId"));
  if (!from) redirect(`/clients/${clientId}?error=${encodeURIComponent("Choose a client to copy from.")}`);
  go(`/clients/${clientId}`, await transact((tx) => copyRules(tx, user.id, from, clientId)));
}
