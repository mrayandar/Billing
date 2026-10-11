// The price calculation (PR-01..03, PR-13, OS-07). A pure function: no database, no clock,
// no floating point. Money is integer paisa; discounts are integer basis points
// (100 bp = 1%, so 10.25% = 1025). It is safe to call for every key press.

export type PriceMode = "RULES" | "LAST_SALE" | "BASE";
export type PriceSource = "BOOK_RULE" | "COMPANY_RULE" | "LAST_SALE" | "MANUAL" | "NONE";

// A client's book rule for one item. A rule with neither field set is ignored.
export type BookRule = { specialPrice: number | null; discountBp: number | null };

export type PriceInput = {
  basePrice: number; // paisa per base unit (the batch price being sold)
  qty: number; // whole number, in the chosen unit
  unitFactor?: number; // base units in the chosen unit (dozen = 12); default 1
  mode?: PriceMode; // default RULES
  bookRule?: BookRule | null; // the client's active book rule for this item
  companyDiscountBp?: number | null; // the client's active discount for this item's company
  lastSaleDiscountBp?: number | null; // discount on the last sale of this item to this client
};

export type PricedLine = {
  price: number; // paisa per chosen unit, before discount
  discountBp: number;
  source: PriceSource;
  gross: number; // price x qty
  lineTotal: number; // gross after discount, rounded half up to the paisa
  discountAmount: number; // gross - lineTotal
  netRate: number; // price after discount per chosen unit, rounded half up (for display only)
};

export const MAX_BP = 10_000; // 100%

// Rounds a / b half up to a whole number, for non-negative whole numbers. BigInt keeps it exact
// even for very large amounts.
function divRoundHalfUp(a: bigint, b: bigint): bigint {
  return (2n * a + b) / (2n * b);
}

function assertWhole(name: string, v: number, min: number, max = Number.MAX_SAFE_INTEGER) {
  if (!Number.isInteger(v) || v < min || v > max) throw new RangeError(`${name} must be a whole number from ${min} to ${max}, got ${v}`);
}

// What a single line costs, once the price and the discount have been decided.
export function totalsFor(price: number, qty: number, discountBp: number) {
  assertWhole("price", price, 0);
  assertWhole("qty", qty, 0);
  assertWhole("discountBp", discountBp, 0, MAX_BP);
  const keep = BigInt(MAX_BP - discountBp);
  const gross = BigInt(price) * BigInt(qty);
  const lineTotal = divRoundHalfUp(gross * keep, BigInt(MAX_BP));
  const netRate = divRoundHalfUp(BigInt(price) * keep, BigInt(MAX_BP));
  return {
    gross: Number(gross),
    lineTotal: Number(lineTotal),
    discountAmount: Number(gross - lineTotal),
    netRate: Number(netRate),
  };
}

// Decides the price and the discount, then works out the totals.
//  RULES      book rule, else company rule, else base price. A book rule fully replaces the
//             company rule: a book rule with only a special price means no discount.
//  LAST_SALE  the discount of the last sale to this client, at today's price (or the client's
//             special price). With no earlier sale it behaves like RULES.
//  BASE       base price, no discount.
export function priceLine(input: PriceInput): PricedLine {
  const factor = input.unitFactor ?? 1;
  assertWhole("unitFactor", factor, 1);
  assertWhole("basePrice", input.basePrice, 0);
  const mode = input.mode ?? "RULES";

  const rule = input.bookRule && (input.bookRule.specialPrice !== null || input.bookRule.discountBp !== null) ? input.bookRule : null;
  let perBase = input.basePrice;
  let discountBp = 0;
  let source: PriceSource = "NONE";

  if (mode !== "BASE") {
    if (mode === "LAST_SALE" && input.lastSaleDiscountBp !== null && input.lastSaleDiscountBp !== undefined) {
      if (rule?.specialPrice != null) perBase = rule.specialPrice;
      discountBp = input.lastSaleDiscountBp;
      source = "LAST_SALE";
    } else if (rule) {
      if (rule.specialPrice !== null) perBase = rule.specialPrice;
      discountBp = rule.discountBp ?? 0;
      source = "BOOK_RULE";
    } else if (input.companyDiscountBp !== null && input.companyDiscountBp !== undefined) {
      discountBp = input.companyDiscountBp;
      source = "COMPANY_RULE";
    }
  }

  const price = perBase * factor;
  return { price, discountBp, source, ...totalsFor(price, input.qty, discountBp) };
}

// The cashier typed their own price and/or discount on the line.
export function priceLineManual(
  base: PricedLine,
  qty: number,
  change: { price?: number; discountBp?: number },
): PricedLine {
  const price = change.price ?? base.price;
  const discountBp = change.discountBp ?? base.discountBp;
  const changed = price !== base.price || discountBp !== base.discountBp;
  return { price, discountBp, source: changed ? "MANUAL" : base.source, ...totalsFor(price, qty, discountBp) };
}

// ───────────── Typing and showing percentages ─────────────

// "12" -> 1200, "10.25" -> 1025. Up to 2 decimals, from 0 to 100. Null when not valid.
export function percentToBp(text: string): number | null {
  const m = /^(\d{1,3})(?:\.(\d{1,2}))?$/.exec(text.trim().replace(/%$/, ""));
  if (!m) return null;
  const bp = Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0"));
  return bp <= MAX_BP ? bp : null;
}

// 1200 -> "12", 1025 -> "10.25", 1250 -> "12.5"
export function bpToPercentText(bp: number): string {
  const whole = Math.floor(bp / 100);
  const rest = bp % 100;
  if (rest === 0) return String(whole);
  return `${whole}.${String(rest).padStart(2, "0").replace(/0$/, "")}`;
}
