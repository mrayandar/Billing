import { describe, expect, it } from "vitest";
import { bpToPercentText, percentToBp, priceLine, priceLineManual, totalsFor } from "./pricing";

const rs = (r: number) => r * 100;
const pct = (p: number) => p * 100;

describe("money tests 1-4 (docs/build-plan.md section 5)", () => {
  it("1. company rule: Oxford Science 7, 1,200, Oxford 10%, qty 15 = 16,200", () => {
    const r = priceLine({ basePrice: rs(1200), qty: 15, companyDiscountBp: pct(10) });
    expect(r).toMatchObject({ source: "COMPANY_RULE", discountBp: 1000, lineTotal: rs(16200) });
  });

  it("2. a book rule beats the company rule: Primary English 5, 850, book 12%, qty 20 = 14,960", () => {
    const r = priceLine({
      basePrice: rs(850),
      qty: 20,
      bookRule: { specialPrice: null, discountBp: pct(12) },
      companyDiscountBp: pct(10),
    });
    expect(r).toMatchObject({ source: "BOOK_RULE", discountBp: 1200, lineTotal: rs(14960) });
  });

  it("3. no rule: walk-in, Oxford Science 6, 1,150, qty 1 = 1,150", () => {
    const r = priceLine({ basePrice: rs(1150), qty: 1 });
    expect(r).toMatchObject({ source: "NONE", discountBp: 0, lineTotal: rs(1150), price: rs(1150) });
  });

  it("4. book special price and discount: Workbook 7, special 430, 15%, qty 10 = 3,655", () => {
    const r = priceLine({
      basePrice: rs(450),
      qty: 10,
      bookRule: { specialPrice: rs(430), discountBp: pct(15) },
      companyDiscountBp: pct(10),
    });
    expect(r).toMatchObject({ source: "BOOK_RULE", price: rs(430), discountBp: 1500, lineTotal: rs(3655) });
  });
});

describe("a book rule fully replaces the company rule", () => {
  it("a special price with no discount means no discount, not the company %", () => {
    const r = priceLine({
      basePrice: rs(450),
      qty: 2,
      bookRule: { specialPrice: rs(400), discountBp: null },
      companyDiscountBp: pct(10),
    });
    expect(r).toMatchObject({ source: "BOOK_RULE", price: rs(400), discountBp: 0, lineTotal: rs(800) });
  });

  it("a book discount of 0% also means no discount", () => {
    const r = priceLine({ basePrice: rs(100), qty: 1, bookRule: { specialPrice: null, discountBp: 0 }, companyDiscountBp: pct(10) });
    expect(r).toMatchObject({ source: "BOOK_RULE", discountBp: 0, lineTotal: rs(100) });
  });

  it("a rule with nothing set is ignored", () => {
    const r = priceLine({ basePrice: rs(100), qty: 1, bookRule: { specialPrice: null, discountBp: null }, companyDiscountBp: pct(10) });
    expect(r).toMatchObject({ source: "COMPANY_RULE", discountBp: 1000 });
  });
});

describe("rounding is half up, once per line, to the paisa", () => {
  it("rounds .5 of a paisa up", () => {
    expect(totalsFor(1001, 1, 5000).lineTotal).toBe(501); // 500.5
    expect(totalsFor(333, 1, 5000).lineTotal).toBe(167); // 166.5
  });

  it("rounds below .5 down and above .5 up", () => {
    expect(totalsFor(333, 1, 1250).lineTotal).toBe(291); // 291.375
    expect(totalsFor(333, 1, 1750).lineTotal).toBe(275); // 274.725
  });

  it("rounds the line total, not each unit", () => {
    const t = totalsFor(101, 3, 5000); // gross 303 -> 151.5 -> 152; per unit 50.5 -> 51 would give 153
    expect(t.lineTotal).toBe(152);
    expect(t.netRate).toBe(51);
  });

  it("handles discounts with two decimals", () => {
    expect(totalsFor(rs(1000), 1, 1025).lineTotal).toBe(rs(1000) - 10250); // 10.25% off 1,000.00
    expect(totalsFor(rs(1000), 1, 1).lineTotal).toBe(99990); // 0.01% off
  });

  it("is exact for very large amounts (no floating point)", () => {
    const price = 999_999_999;
    const qty = 999_999;
    const bp = 3333;
    const expected = (2n * BigInt(price) * BigInt(qty) * BigInt(10000 - bp) + 10000n) / 20000n;
    expect(totalsFor(price, qty, bp).lineTotal).toBe(Number(expected));
  });

  it("is always within half a paisa of the exact value", () => {
    let seed = 12345;
    const rnd = (n: number) => (seed = (seed * 1103515245 + 12345) % 2147483648) % n;
    for (let i = 0; i < 2000; i++) {
      const price = rnd(5_000_000);
      const qty = 1 + rnd(500);
      const bp = rnd(10001);
      const exact2 = price * qty * (10000 - bp); // fits: < 2.5e6*... checked below
      const t = totalsFor(price, qty, bp);
      expect(Math.abs(t.lineTotal * 10000 - exact2)).toBeLessThanOrEqual(5000);
      expect(t.gross - t.discountAmount).toBe(t.lineTotal);
    }
  });
});

describe("units", () => {
  it("prices a dozen as 12 x the piece price, and a special price follows the unit", () => {
    const r = priceLine({ basePrice: rs(30), qty: 2, unitFactor: 12, companyDiscountBp: pct(5) });
    expect(r.price).toBe(rs(360));
    expect(r.lineTotal).toBe(rs(684)); // 720 less 5%
    const s = priceLine({ basePrice: rs(30), qty: 1, unitFactor: 12, bookRule: { specialPrice: rs(28), discountBp: null } });
    expect(s.price).toBe(rs(336));
  });
});

describe("OS-07 price sources", () => {
  it("BASE mode ignores every rule", () => {
    const r = priceLine({ basePrice: rs(850), qty: 1, mode: "BASE", bookRule: { specialPrice: rs(1), discountBp: 5000 }, companyDiscountBp: 1000 });
    expect(r).toMatchObject({ source: "NONE", price: rs(850), discountBp: 0, lineTotal: rs(850) });
  });

  it("LAST_SALE copies the old discount but uses today's price (price rose 260 -> 280)", () => {
    const r = priceLine({ basePrice: rs(280), qty: 10, mode: "LAST_SALE", lastSaleDiscountBp: pct(42), companyDiscountBp: pct(40) });
    expect(r).toMatchObject({ source: "LAST_SALE", price: rs(280), discountBp: 4200 });
    expect(r.lineTotal).toBe(rs(1624)); // 2,800 less 42%
  });

  it("LAST_SALE keeps a special price saved for the client", () => {
    const r = priceLine({
      basePrice: rs(280),
      qty: 10,
      mode: "LAST_SALE",
      lastSaleDiscountBp: pct(42),
      bookRule: { specialPrice: rs(270), discountBp: pct(40) },
    });
    expect(r).toMatchObject({ source: "LAST_SALE", price: rs(270), discountBp: 4200 });
  });

  it("LAST_SALE ignores a book rule that only has a discount (today's price is used)", () => {
    const r = priceLine({ basePrice: rs(280), qty: 1, mode: "LAST_SALE", lastSaleDiscountBp: pct(42), bookRule: { specialPrice: null, discountBp: pct(40) } });
    expect(r).toMatchObject({ price: rs(280), discountBp: 4200 });
  });

  it("LAST_SALE falls back to the client rules when the client never bought the item", () => {
    const r = priceLine({ basePrice: rs(1200), qty: 15, mode: "LAST_SALE", lastSaleDiscountBp: null, companyDiscountBp: pct(10) });
    expect(r).toMatchObject({ source: "COMPANY_RULE", lineTotal: rs(16200) });
  });
});

describe("a typed price or discount", () => {
  it("is marked manual only when it really changes something", () => {
    const base = priceLine({ basePrice: rs(640), qty: 25, companyDiscountBp: pct(8) });
    expect(priceLineManual(base, 25, { discountBp: pct(8) }).source).toBe("COMPANY_RULE");
    const changed = priceLineManual(base, 25, { discountBp: pct(10) });
    expect(changed).toMatchObject({ source: "MANUAL", discountBp: 1000, lineTotal: rs(14400) });
  });
});

describe("bad input is refused", () => {
  it("rejects fractions, negatives and discounts over 100%", () => {
    expect(() => priceLine({ basePrice: 100, qty: 1.5 })).toThrow(RangeError);
    expect(() => priceLine({ basePrice: -1, qty: 1 })).toThrow(RangeError);
    expect(() => totalsFor(100, 1, 10001)).toThrow(RangeError);
    expect(() => priceLine({ basePrice: 100, qty: 1, unitFactor: 0 })).toThrow(RangeError);
  });

  it("allows 0% and 100% discount", () => {
    expect(totalsFor(rs(100), 2, 0).lineTotal).toBe(rs(200));
    expect(totalsFor(rs(100), 2, 10000).lineTotal).toBe(0);
  });
});

describe("percentages", () => {
  it("converts typed percentages to basis points with up to 2 decimals", () => {
    expect(percentToBp("12")).toBe(1200);
    expect(percentToBp("10.25")).toBe(1025);
    expect(percentToBp("7.5")).toBe(750);
    expect(percentToBp("0")).toBe(0);
    expect(percentToBp("100")).toBe(10000);
    expect(percentToBp("12%")).toBe(1200);
  });

  it("rejects what is not a percentage", () => {
    for (const bad of ["", "abc", "-5", "101", "10.255", "1e1", "100.01"]) expect(percentToBp(bad)).toBeNull();
  });

  it("shows basis points as a short percentage", () => {
    expect(bpToPercentText(1200)).toBe("12");
    expect(bpToPercentText(1025)).toBe("10.25");
    expect(bpToPercentText(1250)).toBe("12.5");
    expect(bpToPercentText(0)).toBe("0");
    for (const bp of [0, 1, 50, 750, 1025, 4200, 10000]) expect(percentToBp(bpToPercentText(bp))).toBe(bp);
  });
});

describe("speed", () => {
  it("prices 10,000 lines in well under a second", () => {
    const t0 = performance.now();
    for (let i = 0; i < 10_000; i++) {
      priceLine({ basePrice: rs(850) + i, qty: 1 + (i % 50), bookRule: { specialPrice: null, discountBp: 1200 }, companyDiscountBp: 1000 });
    }
    expect(performance.now() - t0).toBeLessThan(500);
  });
});
