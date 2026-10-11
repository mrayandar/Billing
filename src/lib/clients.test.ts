// Database tests for clients, their rules and the price calculation with real rules.
// They run on the test branch inside transactions that are always rolled back.
// Note: these use their own fresh clients and items, never the sample Ali Traders balance.
import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  checkClientCode,
  clientBalance,
  copyRules,
  createClient,
  nextClientCode,
  quoteLines,
  ruleHistory,
  saveRuleFromBillLine,
  setBookRule,
  setBookRuleActive,
  setClientActive,
  setCompanyDiscount,
  updateClient,
} from "./clients";
import { db } from "./db";
import type { Db } from "./db-types";
import { assertTestDatabase, inRollback, makeRole, makeUser } from "./test-helpers";

beforeAll(assertTestDatabase);
afterAll(() => db.$disconnect());

const rs = (r: number) => r * 100;

async function setup(tx: Db) {
  const role = await makeRole(tx, "T-manager", ["clients.edit"]);
  const actor = await makeUser(tx, role.id, "t_boss");
  const oxford = await tx.company.create({ data: { name: "ZOxford" } });
  const paramount = await tx.company.create({ data: { name: "ZParamount" } });
  let n = 0;
  const item = (companyId: number, basePrice: number, name = "Zitem") =>
    tx.item.create({ data: { code: `ZT${++n}`, codeKey: `zt${n}`, name: `${name} ${n}`, companyId, basePrice } });
  const client = async (name = "Zclient", extra = {}) => {
    const r = await createClient(tx, actor.id, { name, ...extra });
    if (!r.ok) throw new Error(r.error);
    return r.value;
  };
  return { actor, oxford, paramount, item, client };
}

describe("client codes", () => {
  it("continues plain numbers after the highest number already used", async () => {
    await inRollback(async (tx) => {
      const { client } = await setup(tx);
      const first = await client("A", { code: "64" });
      expect(first.code).toBe("64");
      const next = await nextClientCode(tx);
      expect(Number(next)).toBeGreaterThan(64);
      const auto = await client("B");
      expect(auto.code).toBe(next);
      // letters in a code do not break the numbering
      await client("C", { code: "Ked11" });
      expect(Number(await nextClientCode(tx))).toBe(Number(next) + 1);
    });
  });

  it("keeps a typed code, ignores capitals, and rejects duplicates and bad codes", async () => {
    await inRollback(async (tx) => {
      const { actor, client } = await setup(tx);
      await client("Dup1", { code: "Ked11" });
      expect(await checkClientCode(tx, "KED11")).toMatch(/already used/);
      expect(await createClient(tx, actor.id, { name: "Dup2", code: "ked11" })).toMatchObject({ ok: false });
      for (const bad of ["ABCDEFGHIJ123", "A-1", "has space"]) {
        expect(await createClient(tx, actor.id, { name: "Bad", code: bad })).toMatchObject({ ok: false });
      }
    });
  });

  it("can change a code only to a free one", async () => {
    await inRollback(async (tx) => {
      const { actor, client } = await setup(tx);
      const a = await client("A", { code: "ZA1" });
      await client("B", { code: "ZB1" });
      expect(await updateClient(tx, actor.id, a.id, { name: "A", code: "zb1" })).toMatchObject({ ok: false });
      expect(await updateClient(tx, actor.id, a.id, { name: "A", code: "ZA2" })).toMatchObject({ ok: true });
    });
  });
});

describe("opening balance", () => {
  it("is an OPENING ledger row: they owe us is a debit, we owe them is a credit", async () => {
    await inRollback(async (tx) => {
      const { actor } = await setup(tx);
      const owes = await createClient(tx, actor.id, { name: "Owes us" }, { openingBalance: rs(24300) });
      const owed = await createClient(tx, actor.id, { name: "We owe" }, { openingBalance: -rs(1500) });
      const none = await createClient(tx, actor.id, { name: "None" });
      if (!owes.ok || !owed.ok || !none.ok) throw new Error("setup failed");
      expect(await clientBalance(tx, owes.value.id)).toBe(rs(24300));
      expect(await clientBalance(tx, owed.value.id)).toBe(-rs(1500));
      expect(await clientBalance(tx, none.value.id)).toBe(0);
      const rows = await tx.ledgerEntry.findMany({ where: { clientId: owes.value.id } });
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ docType: "OPENING", debit: rs(24300), credit: 0 });
      expect(await tx.ledgerEntry.count({ where: { clientId: none.value.id } })).toBe(0);
    });
  });
});

describe("switching off, not deleting", () => {
  it("switches a client off and on, with an audit row", async () => {
    await inRollback(async (tx) => {
      const { actor, client } = await setup(tx);
      const c = await client();
      await setClientActive(tx, actor.id, c.id, false);
      expect((await tx.client.findUniqueOrThrow({ where: { id: c.id } })).active).toBe(false);
      expect(await tx.auditLog.count({ where: { tableName: "clients", recordId: String(c.id), action: "deactivated" } })).toBe(1);
      await setClientActive(tx, actor.id, c.id, true);
      expect((await tx.client.findUniqueOrThrow({ where: { id: c.id } })).active).toBe(true);
    });
  });

  it("ignores a switched-off book rule or company discount, and keeps the row", async () => {
    await inRollback(async (tx) => {
      const { actor, oxford, item, client } = await setup(tx);
      const c = await client();
      const book = await item(oxford.id, rs(850));
      await setCompanyDiscount(tx, actor.id, c.id, oxford.id, 1000);
      await setBookRule(tx, actor.id, c.id, book.id, { specialPrice: null, discountBp: 1200 });
      expect((await quoteLines(tx, c.id, [{ itemId: book.id, qty: 20 }]))[0].lineTotal).toBe(rs(14960));

      await setBookRuleActive(tx, actor.id, c.id, book.id, false);
      const afterBook = (await quoteLines(tx, c.id, [{ itemId: book.id, qty: 20 }]))[0];
      expect(afterBook).toMatchObject({ source: "COMPANY_RULE", discountBp: 1000, lineTotal: rs(15300) });
      expect(await tx.clientItemRule.count({ where: { clientId: c.id, itemId: book.id } })).toBe(1);

      await setCompanyDiscount(tx, actor.id, c.id, oxford.id, null);
      expect((await quoteLines(tx, c.id, [{ itemId: book.id, qty: 20 }]))[0]).toMatchObject({ source: "NONE", lineTotal: rs(17000) });
      expect(await tx.clientCompanyDiscount.count({ where: { clientId: c.id, companyId: oxford.id } })).toBe(1);

      await setBookRuleActive(tx, actor.id, c.id, book.id, true);
      expect((await quoteLines(tx, c.id, [{ itemId: book.id, qty: 20 }]))[0].lineTotal).toBe(rs(14960));
    });
  });
});

describe("rules with real data (money tests 1-4)", () => {
  it("prices the sample cases for a client", async () => {
    await inRollback(async (tx) => {
      const { actor, oxford, item, client } = await setup(tx);
      const ali = await client("Ali");
      const science7 = await item(oxford.id, rs(1200));
      const english5 = await item(oxford.id, rs(850));
      const science6 = await item(oxford.id, rs(1150));
      const workbook7 = await item(oxford.id, rs(450));
      await setCompanyDiscount(tx, actor.id, ali.id, oxford.id, 1000);
      await setBookRule(tx, actor.id, ali.id, english5.id, { specialPrice: null, discountBp: 1200 });
      await setBookRule(tx, actor.id, ali.id, workbook7.id, { specialPrice: rs(430), discountBp: 1500 });

      const q = await quoteLines(tx, ali.id, [
        { itemId: science7.id, qty: 15 },
        { itemId: english5.id, qty: 20 },
        { itemId: workbook7.id, qty: 10 },
      ]);
      expect(q.map((l) => l.lineTotal)).toEqual([rs(16200), rs(14960), rs(3655)]);
      expect(q.map((l) => l.source)).toEqual(["COMPANY_RULE", "BOOK_RULE", "BOOK_RULE"]);

      // 3. a walk-in pays the base price with no discount
      const walkIn = await quoteLines(tx, null, [{ itemId: science6.id, qty: 1 }]);
      expect(walkIn[0]).toMatchObject({ source: "NONE", lineTotal: rs(1150) });
    });
  });

  it("never lets one client's rules touch another client or the base price", async () => {
    await inRollback(async (tx) => {
      const { actor, oxford, item, client } = await setup(tx);
      const a = await client("A");
      const b = await client("B");
      const book = await item(oxford.id, rs(1000));
      await setCompanyDiscount(tx, actor.id, a.id, oxford.id, 2000);
      await setBookRule(tx, actor.id, a.id, book.id, { specialPrice: rs(500), discountBp: null });
      expect((await quoteLines(tx, b.id, [{ itemId: book.id, qty: 1 }]))[0]).toMatchObject({ source: "NONE", lineTotal: rs(1000) });
      expect((await tx.item.findUniqueOrThrow({ where: { id: book.id } })).basePrice).toBe(rs(1000));
    });
  });

  it("applies the unit factor (a dozen) to the base price", async () => {
    await inRollback(async (tx) => {
      const { actor, oxford, item, client } = await setup(tx);
      const c = await client();
      const pen = await item(oxford.id, rs(30));
      await setCompanyDiscount(tx, actor.id, c.id, oxford.id, 500);
      const [l] = await quoteLines(tx, c.id, [{ itemId: pen.id, qty: 2, unitFactor: 12 }]);
      expect(l).toMatchObject({ price: rs(360), lineTotal: rs(684) });
    });
  });
});

describe("the save tick (money tests 5 and 6)", () => {
  async function paramountCase(tx: Db) {
    const s = await setup(tx);
    const c = await s.client("Ali");
    const maths6 = await s.item(s.paramount.id, rs(640), "Paramount Mathematics 6");
    await setCompanyDiscount(tx, s.actor.id, c.id, s.paramount.id, 800);
    return { ...s, c, maths6 };
  }

  it("5. tick ON: 8% changed to 10% is saved, and the next bill is 14,400", async () => {
    await inRollback(async (tx) => {
      const { actor, c, maths6 } = await paramountCase(tx);
      expect((await quoteLines(tx, c.id, [{ itemId: maths6.id, qty: 25 }]))[0].lineTotal).toBe(rs(14720));
      const saved = await saveRuleFromBillLine(tx, actor.id, {
        clientId: c.id, itemId: maths6.id, finalPrice: rs(640), finalDiscountBp: 1000, billNo: "C1-1042", tick: true,
      });
      expect(saved).toEqual({ ok: true, value: { saved: true } });
      const next = (await quoteLines(tx, c.id, [{ itemId: maths6.id, qty: 25 }]))[0];
      expect(next).toMatchObject({ source: "BOOK_RULE", discountBp: 1000, lineTotal: rs(14400) });
      const rule = await tx.clientItemRule.findUniqueOrThrow({ where: { clientId_itemId: { clientId: c.id, itemId: maths6.id } } });
      expect(rule).toMatchObject({ specialPrice: null, discountBp: 1000, sourceBillNo: "C1-1042", setById: actor.id, active: true });
      expect(rule.setAt).toBeInstanceOf(Date);
    });
  });

  it("6. tick OFF: the same change saves nothing, and the next bill is 14,720 (8% again)", async () => {
    await inRollback(async (tx) => {
      const { actor, c, maths6 } = await paramountCase(tx);
      const saved = await saveRuleFromBillLine(tx, actor.id, {
        clientId: c.id, itemId: maths6.id, finalPrice: rs(640), finalDiscountBp: 1000, billNo: "C1-1042", tick: false,
      });
      expect(saved).toEqual({ ok: true, value: { saved: false } });
      expect(await tx.clientItemRule.count({ where: { clientId: c.id } })).toBe(0);
      expect((await quoteLines(tx, c.id, [{ itemId: maths6.id, qty: 25 }]))[0]).toMatchObject({ source: "COMPANY_RULE", lineTotal: rs(14720) });
    });
  });

  it("saves nothing when the tick is on but nothing was changed", async () => {
    await inRollback(async (tx) => {
      const { actor, c, maths6 } = await paramountCase(tx);
      const saved = await saveRuleFromBillLine(tx, actor.id, {
        clientId: c.id, itemId: maths6.id, finalPrice: rs(640), finalDiscountBp: 800, tick: true,
      });
      expect(saved).toEqual({ ok: true, value: { saved: false } });
      expect(await tx.clientItemRule.count({ where: { clientId: c.id } })).toBe(0);
    });
  });

  it("saves a changed price as a special price, and keeps an existing special price when only the discount changes", async () => {
    await inRollback(async (tx) => {
      const { actor, c, maths6 } = await paramountCase(tx);
      await saveRuleFromBillLine(tx, actor.id, { clientId: c.id, itemId: maths6.id, finalPrice: rs(600), finalDiscountBp: 800, tick: true });
      let rule = await tx.clientItemRule.findUniqueOrThrow({ where: { clientId_itemId: { clientId: c.id, itemId: maths6.id } } });
      expect(rule).toMatchObject({ specialPrice: rs(600), discountBp: 800 });
      await saveRuleFromBillLine(tx, actor.id, { clientId: c.id, itemId: maths6.id, finalPrice: rs(600), finalDiscountBp: 1000, tick: true });
      rule = await tx.clientItemRule.findUniqueOrThrow({ where: { clientId_itemId: { clientId: c.id, itemId: maths6.id } } });
      expect(rule).toMatchObject({ specialPrice: rs(600), discountBp: 1000 });
    });
  });

  it("records the change in the audit log with old and new values", async () => {
    await inRollback(async (tx) => {
      const { actor, c, maths6 } = await paramountCase(tx);
      await saveRuleFromBillLine(tx, actor.id, { clientId: c.id, itemId: maths6.id, finalPrice: rs(640), finalDiscountBp: 1000, billNo: "C1-9", tick: true });
      await setBookRule(tx, actor.id, c.id, maths6.id, { specialPrice: null, discountBp: 1100 });
      const history = await ruleHistory(tx, c.id);
      const rule = history.filter((h) => h.tableName === "client_item_rules");
      expect(rule[0]).toMatchObject({ action: "update", userName: "t_boss" });
      expect(rule[0].oldValue).toMatchObject({ discountBp: 1000 });
      expect(rule[0].newValue).toMatchObject({ discountBp: 1100 });
      expect(rule[1].newValue).toMatchObject({ bill: "C1-9", discountBp: 1000 });
    });
  });
});

describe("OS-07: last sale to this client", () => {
  async function saleLine(tx: Db, actorId: number, clientId: number, itemId: number, discountBp: number, createdAt: string, status: "ACTIVE" | "CANCELLED" = "ACTIVE") {
    const device = (await tx.device.findFirst()) ?? (await tx.device.create({ data: { name: "T", billPrefix: "ZT" } }));
    const sale = await tx.sale.create({
      data: {
        billNo: `ZT-${Math.random().toString(36).slice(2, 9)}`, deviceId: device.id, type: "WHOLESALE", clientId, userId: actorId,
        grossTotal: 0, discountTotal: 0, total: 0, status, createdAt: new Date(createdAt),
      },
    });
    await tx.saleLine.create({
      data: { saleId: sale.id, lineNo: 1, itemId, qty: 10, basePrice: 26000, price: 26000, discountBp, discountSource: "MANUAL", lineTotal: 0 },
    });
  }

  it("copies the last discount but uses today's price when the price rose from 260 to 280", async () => {
    await inRollback(async (tx) => {
      const { actor, oxford, item, client } = await setup(tx);
      const c = await client("Ali");
      const hamdard = await item(oxford.id, rs(280), "Hamdard Science 9"); // price is now 280
      await saleLine(tx, actor.id, c.id, hamdard.id, 4000, "2026-04-03T10:00:00Z"); // old: 40%
      await saleLine(tx, actor.id, c.id, hamdard.id, 4200, "2026-09-28T10:00:00Z"); // latest: 42%
      await saleLine(tx, actor.id, c.id, hamdard.id, 1000, "2026-10-01T10:00:00Z", "CANCELLED"); // cancelled: ignored
      await setCompanyDiscount(tx, actor.id, c.id, oxford.id, 3000);

      const [l] = await quoteLines(tx, c.id, [{ itemId: hamdard.id, qty: 10 }], "LAST_SALE");
      expect(l).toMatchObject({ source: "LAST_SALE", price: rs(280), discountBp: 4200, lineTotal: rs(1624) });
    });
  });

  it("keeps the client's saved special price, with the last sale's discount", async () => {
    await inRollback(async (tx) => {
      const { actor, oxford, item, client } = await setup(tx);
      const c = await client("Ali");
      const book = await item(oxford.id, rs(280));
      await saleLine(tx, actor.id, c.id, book.id, 4200, "2026-09-28T10:00:00Z");
      await setBookRule(tx, actor.id, c.id, book.id, { specialPrice: rs(270), discountBp: 4000 });
      const [l] = await quoteLines(tx, c.id, [{ itemId: book.id, qty: 10 }], "LAST_SALE");
      expect(l).toMatchObject({ source: "LAST_SALE", price: rs(270), discountBp: 4200 });
    });
  });

  it("falls back to the client rules when the client never bought the item", async () => {
    await inRollback(async (tx) => {
      const { actor, oxford, item, client } = await setup(tx);
      const c = await client("Ali");
      const other = await client("Other");
      const book = await item(oxford.id, rs(1200));
      await setCompanyDiscount(tx, actor.id, c.id, oxford.id, 1000);
      await saleLine(tx, actor.id, other.id, book.id, 5000, "2026-09-28T10:00:00Z"); // someone else's sale
      const [l] = await quoteLines(tx, c.id, [{ itemId: book.id, qty: 15 }], "LAST_SALE");
      expect(l).toMatchObject({ source: "COMPANY_RULE", lineTotal: rs(16200) });
    });
  });

  it("BASE mode gives the base price with no discount even when rules exist", async () => {
    await inRollback(async (tx) => {
      const { actor, oxford, item, client } = await setup(tx);
      const c = await client("Ali");
      const book = await item(oxford.id, rs(1200));
      await setCompanyDiscount(tx, actor.id, c.id, oxford.id, 1000);
      const [l] = await quoteLines(tx, c.id, [{ itemId: book.id, qty: 15 }], "BASE");
      expect(l).toMatchObject({ source: "NONE", lineTotal: rs(18000) });
    });
  });
});

describe("copying another client's discounts", () => {
  it("copies active company discounts and book rules, and skips switched-off ones", async () => {
    await inRollback(async (tx) => {
      const { actor, oxford, paramount, item, client } = await setup(tx);
      const from = await client("From");
      const book1 = await item(oxford.id, rs(850));
      const book2 = await item(oxford.id, rs(450));
      await setCompanyDiscount(tx, actor.id, from.id, oxford.id, 1000);
      await setCompanyDiscount(tx, actor.id, from.id, paramount.id, 800);
      await setCompanyDiscount(tx, actor.id, from.id, paramount.id, null); // switched off
      await setBookRule(tx, actor.id, from.id, book1.id, { specialPrice: null, discountBp: 1200 });
      await setBookRule(tx, actor.id, from.id, book2.id, { specialPrice: rs(430), discountBp: 1500 });
      await setBookRuleActive(tx, actor.id, from.id, book2.id, false);

      const created = await createClient(tx, actor.id, { name: "Madina" }, { copyDiscountsFromClientId: from.id });
      if (!created.ok) throw new Error(created.error);
      const to = created.value.id;
      expect(await tx.clientCompanyDiscount.count({ where: { clientId: to, active: true } })).toBe(1);
      expect(await tx.clientItemRule.count({ where: { clientId: to, active: true } })).toBe(1);
      expect((await quoteLines(tx, to, [{ itemId: book1.id, qty: 20 }]))[0].lineTotal).toBe(rs(14960));
      expect(await copyRules(tx, actor.id, from.id, from.id)).toMatchObject({ ok: false });
    });
  });
});

describe("rule validation", () => {
  it("refuses empty rules, bad percentages and unknown clients", async () => {
    await inRollback(async (tx) => {
      const { actor, oxford, item, client } = await setup(tx);
      const c = await client();
      const book = await item(oxford.id, rs(100));
      expect(await setBookRule(tx, actor.id, c.id, book.id, { specialPrice: null, discountBp: null })).toMatchObject({ ok: false });
      expect(await setBookRule(tx, actor.id, c.id, book.id, { specialPrice: null, discountBp: 10001 })).toMatchObject({ ok: false });
      expect(await setBookRule(tx, actor.id, c.id, book.id, { specialPrice: -1, discountBp: null })).toMatchObject({ ok: false });
      expect(await setCompanyDiscount(tx, actor.id, c.id, oxford.id, 10001)).toMatchObject({ ok: false });
      expect(await setCompanyDiscount(tx, actor.id, 999_999_999, oxford.id, 100)).toMatchObject({ ok: false });
    });
  });

  it("accepts a discount with two decimals", async () => {
    await inRollback(async (tx) => {
      const { actor, oxford, item, client } = await setup(tx);
      const c = await client();
      const book = await item(oxford.id, rs(1000));
      await setCompanyDiscount(tx, actor.id, c.id, oxford.id, 1025);
      expect((await quoteLines(tx, c.id, [{ itemId: book.id, qty: 1 }]))[0].lineTotal).toBe(rs(1000) - 10250);
    });
  });
});
