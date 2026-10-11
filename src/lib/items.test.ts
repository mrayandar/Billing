// Database tests for items, codes, barcodes, units, categories and search.
// They run on the test branch inside transactions that are always rolled back.
import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "./db";
import type { Db } from "./db-types";
import {
  addBarcode,
  categoryPaths,
  createCategory,
  createCompany,
  createItem,
  findItemByCodeOrBarcode,
  nextItemCode,
  searchItems,
  setUnits,
  updateCategory,
  updateItem,
  type ItemInput,
} from "./items";
import { assertTestDatabase, inRollback, makeRole, makeUser } from "./test-helpers";

beforeAll(assertTestDatabase);
afterAll(() => db.$disconnect());

async function setup(tx: Db) {
  const role = await makeRole(tx, "T-manager", ["items.edit"]);
  const actor = await makeUser(tx, role.id, "t_boss");
  const company = await tx.company.create({ data: { name: "Zyxco Press" } });
  const base = (over: Partial<ItemInput> = {}): ItemInput => ({
    name: "Zyx Test Book",
    companyId: company.id,
    basePrice: 85000,
    ...over,
  });
  const make = async (over: Partial<ItemInput> & { extraBarcodes?: string[]; units?: { unitName: string; factor: number }[] } = {}) => {
    const r = await createItem(tx, actor.id, { ...base(), ...over }, { canSetCost: true });
    if (!r.ok) throw new Error(r.error);
    return r.value;
  };
  return { actor, company, base, make };
}

describe("item codes", () => {
  it("hands out plain running numbers from 1001, one after the other", async () => {
    await inRollback(async (tx) => {
      const { make } = await setup(tx);
      const a = await make({ name: "Zyx A" });
      const b = await make({ name: "Zyx B" });
      expect(Number(a.code)).toBeGreaterThanOrEqual(1001);
      expect(Number(b.code)).toBe(Number(a.code) + 1);
    });
  });

  it("lets the owner type a code, and keeps codes unique", async () => {
    await inRollback(async (tx) => {
      const { actor, base, make } = await setup(tx);
      const a = await make({ code: "ZX1" });
      expect(a.code).toBe("ZX1");
      const dup = await createItem(tx, actor.id, base({ name: "Zyx other", code: "ZX1" }), { canSetCost: false });
      expect(dup).toMatchObject({ ok: false });
      const bad = await createItem(tx, actor.id, base({ code: "has space" }), { canSetCost: false });
      expect(bad).toMatchObject({ ok: false });
    });
  });

  it("skips numbers that were typed in by hand", async () => {
    await inRollback(async (tx) => {
      const { make } = await setup(tx);
      const first = Number(await nextItemCode(tx));
      await make({ code: String(first + 1), name: "Zyx hand typed" });
      const next = Number(await nextItemCode(tx));
      expect(next).toBeGreaterThan(first + 1);
    });
  });

  it("never reuses a code, even after the item changed its code or was removed", async () => {
    await inRollback(async (tx) => {
      const { actor, base, make } = await setup(tx);
      const a = await make({ code: "ZXOLD", name: "Zyx renamed" });
      await updateItem(tx, actor.id, a.id, base({ name: "Zyx renamed", code: "ZXNEW" }), { canSetCost: false });
      const reuse = await createItem(tx, actor.id, base({ name: "Zyx newcomer", code: "ZXOLD" }), { canSetCost: false });
      expect(reuse).toMatchObject({ ok: false });
      expect((reuse as { error: string }).error).toMatch(/never reused/);

      const b = await make({ code: "ZXGONE", name: "Zyx removed" });
      await tx.itemBarcode.deleteMany({ where: { itemId: b.id } });
      await tx.item.delete({ where: { id: b.id } });
      const again = await createItem(tx, actor.id, base({ name: "Zyx again", code: "ZXGONE" }), { canSetCost: false });
      expect(again).toMatchObject({ ok: false });
    });
  });

  it("changes a code only to a free one, and records the change", async () => {
    await inRollback(async (tx) => {
      const { actor, base, make } = await setup(tx);
      const a = await make({ code: "ZXA", name: "Zyx a" });
      await make({ code: "ZXB", name: "Zyx b" });
      const taken = await updateItem(tx, actor.id, a.id, base({ name: "Zyx a", code: "ZXB" }), { canSetCost: false });
      expect(taken).toMatchObject({ ok: false });
      const ok = await updateItem(tx, actor.id, a.id, base({ name: "Zyx a", code: "ZXC" }), { canSetCost: false });
      expect(ok).toMatchObject({ ok: true });
      const row = await tx.auditLog.findFirstOrThrow({ where: { tableName: "items", recordId: String(a.id), action: "update" } });
      expect(row.oldValue).toEqual({ code: "ZXA" });
      expect(row.newValue).toEqual({ code: "ZXC" });
    });
  });
});

describe("letter-and-number item codes (OS-01)", () => {
  it("accepts codes like Ked11, HS8 and Oi9, keeping the letters as typed", async () => {
    await inRollback(async (tx) => {
      const { make } = await setup(tx);
      for (const code of ["Ked11", "HS8", "Oi9", "ABCDEFGHIJ12"]) {
        const item = await make({ code, name: "Zyx " + code });
        expect(item.code).toBe(code);
      }
    });
  });

  it("rejects codes longer than 12 characters, or with spaces or symbols", async () => {
    await inRollback(async (tx) => {
      const { actor, base } = await setup(tx);
      for (const code of ["ABCDEFGHIJ123", "has space", "A-1", "A_1", "A.1"]) {
        const r = await createItem(tx, actor.id, base({ code }), { canSetCost: false });
        expect(r).toMatchObject({ ok: false });
      }
    });
  });

  it("treats upper and lower case as the same code", async () => {
    await inRollback(async (tx) => {
      const { actor, base, make } = await setup(tx);
      const a = await make({ code: "Ked11", name: "Zyx Ked" });
      for (const typed of ["ked11", "KED11", "kEd11"]) {
        const r = await createItem(tx, actor.id, base({ name: "Zyx dup " + typed, code: typed }), { canSetCost: false });
        expect(r).toMatchObject({ ok: false });
      }
      // typing it in any case finds the item
      for (const typed of ["Ked11", "ked11", "KED11"]) {
        expect((await findItemByCodeOrBarcode(tx, typed))?.id).toBe(a.id);
        expect((await searchItems(tx, { q: typed, chip: "all" })).items[0].id).toBe(a.id);
      }
    });
  });

  it("lets an item change only the capital letters of its own code", async () => {
    await inRollback(async (tx) => {
      const { actor, base, make } = await setup(tx);
      const a = await make({ code: "Ked11", name: "Zyx case" });
      expect(await updateItem(tx, actor.id, a.id, base({ name: "Zyx case", code: "KED11" }), { canSetCost: false })).toMatchObject({ ok: true });
      expect((await tx.item.findUniqueOrThrow({ where: { id: a.id } })).code).toBe("KED11");
    });
  });

  it("gives an automatic number only when the code is left blank", async () => {
    await inRollback(async (tx) => {
      const { make } = await setup(tx);
      const blank = await make({ code: "", name: "Zyx blank" });
      expect(blank.code).toMatch(/^[0-9]+$/);
      expect(Number(blank.code)).toBeGreaterThanOrEqual(1001);
      const typed = await make({ code: "HS8", name: "Zyx typed" });
      expect(typed.code).toBe("HS8");
    });
  });

  it("never lets a code match a barcode, whatever the capital letters", async () => {
    await inRollback(async (tx) => {
      const { actor, base, make } = await setup(tx);
      await make({ name: "Zyx barcode holder", extraBarcodes: ["AbC12345"] });
      const r = await createItem(tx, actor.id, base({ name: "Zyx clash", code: "abc12345" }), { canSetCost: false });
      expect(r).toMatchObject({ ok: false });
      const other = await make({ code: "Qq77", name: "Zyx other" });
      expect(await addBarcode(tx, actor.id, (await make({ name: "Zyx third" })).id, "QQ77")).toMatchObject({ ok: false });
      expect(other.code).toBe("Qq77");
    });
  });

  it("never reuses a code even when only the capital letters differ", async () => {
    await inRollback(async (tx) => {
      const { actor, base, make } = await setup(tx);
      const a = await make({ code: "Old77", name: "Zyx moves" });
      await updateItem(tx, actor.id, a.id, base({ name: "Zyx moves", code: "New77" }), { canSetCost: false });
      const r = await createItem(tx, actor.id, base({ name: "Zyx taker", code: "OLD77" }), { canSetCost: false });
      expect(r).toMatchObject({ ok: false });
      expect((r as { error: string }).error).toMatch(/never reused/);
    });
  });
});

describe("barcodes are unique, and never equal to an item code", () => {
  it("gives every new item its code as a shop barcode and the ISBN as a barcode", async () => {
    await inRollback(async (tx) => {
      const { make } = await setup(tx);
      const a = await make({ isbn: "9780190000011" });
      const barcodes = await tx.itemBarcode.findMany({ where: { itemId: a.id } });
      expect(barcodes.map((b) => b.barcode).sort()).toEqual([a.code, "9780190000011"].sort());
      expect((await findItemByCodeOrBarcode(tx, "9780190000011"))?.id).toBe(a.id);
    });
  });

  it("rejects a barcode that another item already has, naming that item", async () => {
    await inRollback(async (tx) => {
      const { actor, make } = await setup(tx);
      await make({ name: "Zyx owner of barcode", extraBarcodes: ["ZB-12345"] });
      const b = await make({ name: "Zyx second" });
      const r = await addBarcode(tx, actor.id, b.id, "ZB-12345");
      expect(r).toMatchObject({ ok: false });
      expect((r as { error: string }).error).toContain("Zyx owner of barcode");
    });
  });

  it("rejects a new item whose extra barcode is already taken", async () => {
    await inRollback(async (tx) => {
      const { actor, base, make } = await setup(tx);
      await make({ extraBarcodes: ["ZB-777"] });
      const r = await createItem(tx, actor.id, { ...base({ name: "Zyx dup" }), extraBarcodes: ["ZB-777"] }, { canSetCost: false });
      expect(r).toMatchObject({ ok: false });
    });
  });

  it("refuses a short code that equals another item's barcode", async () => {
    await inRollback(async (tx) => {
      const { actor, base, make } = await setup(tx);
      await make({ extraBarcodes: ["8901234567890"] });
      const r = await createItem(tx, actor.id, base({ name: "Zyx clash", code: "8901234567890" }), { canSetCost: false });
      expect(r).toMatchObject({ ok: false });
      expect((r as { error: string }).error).toMatch(/barcode/);
    });
  });

  it("refuses a barcode that equals another item's short code", async () => {
    await inRollback(async (tx) => {
      const { actor, make } = await setup(tx);
      const a = await make({ code: "ZC4321", name: "Zyx has code" });
      const b = await make({ name: "Zyx wants barcode" });
      const r = await addBarcode(tx, actor.id, b.id, a.code);
      expect(r).toMatchObject({ ok: false });
      expect((r as { error: string }).error).toContain("Zyx has code");
    });
  });

  it("refuses to change a code to something that is another item's barcode", async () => {
    await inRollback(async (tx) => {
      const { actor, base, make } = await setup(tx);
      await make({ name: "Zyx barcode owner", extraBarcodes: ["ZD9999"] });
      const b = await make({ name: "Zyx changer" });
      const r = await updateItem(tx, actor.id, b.id, base({ name: "Zyx changer", code: "ZD9999" }), { canSetCost: false });
      expect(r).toMatchObject({ ok: false });
    });
  });

  it("allows an item's own barcode to equal its own code", async () => {
    await inRollback(async (tx) => {
      const { make } = await setup(tx);
      const a = await make({ code: "ZE1", name: "Zyx own" });
      expect(await tx.itemBarcode.count({ where: { itemId: a.id, barcode: "ZE1" } })).toBe(1);
    });
  });
});

describe("cost price follows permission", () => {
  it("ignores a cost typed by someone without cost permission, and keeps the old cost on edit", async () => {
    await inRollback(async (tx) => {
      const { actor, base } = await setup(tx);
      const created = await createItem(tx, actor.id, base({ costPrice: 5000 }), { canSetCost: false });
      if (!created.ok) throw new Error(created.error);
      expect((await tx.item.findUniqueOrThrow({ where: { id: created.value.id } })).costPrice).toBe(0);
      await tx.item.update({ where: { id: created.value.id }, data: { costPrice: 55200 } });
      await updateItem(tx, actor.id, created.value.id, base({ costPrice: 1 }), { canSetCost: false });
      expect((await tx.item.findUniqueOrThrow({ where: { id: created.value.id } })).costPrice).toBe(55200);
      await updateItem(tx, actor.id, created.value.id, base({ costPrice: 60000 }), { canSetCost: true });
      expect((await tx.item.findUniqueOrThrow({ where: { id: created.value.id } })).costPrice).toBe(60000);
    });
  });
});

describe("units and conversions", () => {
  it("stores dozen, box and carton factors on the item", async () => {
    await inRollback(async (tx) => {
      const { actor, make } = await setup(tx);
      const a = await make({ units: [{ unitName: "dozen", factor: 12 }] });
      expect(
        await setUnits(tx, actor.id, a.id, [
          { unitName: "dozen", factor: 12 },
          { unitName: "box", factor: 24 },
          { unitName: "carton", factor: 288 },
        ]),
      ).toMatchObject({ ok: true });
      const units = await tx.itemUnit.findMany({ where: { itemId: a.id }, orderBy: { factor: "asc" } });
      expect(units.map((u) => [u.unitName, u.factor])).toEqual([["dozen", 12], ["box", 24], ["carton", 288]]);
    });
  });

  it("rejects a factor below 2, a repeated name, or the base unit again", async () => {
    await inRollback(async (tx) => {
      const { actor, make } = await setup(tx);
      const a = await make({});
      expect(await setUnits(tx, actor.id, a.id, [{ unitName: "box", factor: 1 }])).toMatchObject({ ok: false });
      expect(await setUnits(tx, actor.id, a.id, [{ unitName: "box", factor: 2.5 }])).toMatchObject({ ok: false });
      expect(await setUnits(tx, actor.id, a.id, [{ unitName: "Box", factor: 6 }, { unitName: "box", factor: 12 }])).toMatchObject({ ok: false });
      expect(await setUnits(tx, actor.id, a.id, [{ unitName: "Piece", factor: 6 }])).toMatchObject({ ok: false });
    });
  });
});

describe("companies and categories", () => {
  it("rejects a duplicate company name", async () => {
    await inRollback(async (tx) => {
      const { actor } = await setup(tx);
      expect(await createCompany(tx, actor.id, "Zyxco Press", "PUBLISHER")).toMatchObject({ ok: false });
      expect(await createCompany(tx, actor.id, "Zyxco Other", "MANUFACTURER")).toMatchObject({ ok: true });
    });
  });

  it("builds a category tree of any depth and refuses to move a category inside itself", async () => {
    await inRollback(async (tx) => {
      const { actor } = await setup(tx);
      const a = await createCategory(tx, actor.id, "ZBooks", null);
      const b = await createCategory(tx, actor.id, "ZTextbooks", a.ok ? a.value : null);
      const c = await createCategory(tx, actor.id, "ZClass 9", b.ok ? b.value : null);
      const d = await createCategory(tx, actor.id, "ZPhysics", c.ok ? c.value : null);
      if (!a.ok || !b.ok || !c.ok || !d.ok) throw new Error("setup failed");
      const paths = await categoryPaths(tx);
      expect(paths.find((p) => p.id === d.value)?.path).toBe("ZBooks › ZTextbooks › ZClass 9 › ZPhysics");
      expect(await updateCategory(tx, actor.id, a.value, "ZBooks", d.value)).toMatchObject({ ok: false });
      expect(await updateCategory(tx, actor.id, a.value, "ZBooks", a.value)).toMatchObject({ ok: false });
      expect(await createCategory(tx, actor.id, "zbooks", null)).toMatchObject({ ok: false });
    });
  });
});

describe("search", () => {
  it("finds partial words in name, author, ISBN, company, Urdu name and English spelling", async () => {
    await inRollback(async (tx) => {
      const { make } = await setup(tx);
      const a = await make({
        name: "Qwertyuiop Grammar",
        author: "Zebulon Quillfeather",
        isbn: "9789690000123",
        nameUrdu: "بانگ درا زیکس",
        searchSpelling: "Bang-e-Zyxa",
      });
      const find = async (q: string) => (await searchItems(tx, { q, chip: "all" })).items.map((i) => i.id);
      expect(await find("qwerty")).toContain(a.id); // part of a word in the name
      expect(await find("QUILLFEA")).toContain(a.id); // author, any case
      expect(await find("9789690000")).toContain(a.id); // part of the ISBN
      expect(await find("zyxco")).toContain(a.id); // company name
      expect(await find("درا زیکس")).toContain(a.id); // Urdu name
      expect(await find("bang-e-zy")).toContain(a.id); // English spelling of an Urdu title
      expect(await find("grammar quill")).toContain(a.id); // every word matches, in different fields
      expect(await find("grammar nonexistentword")).not.toContain(a.id);
    });
  });

  it("puts an exact code or barcode first", async () => {
    await inRollback(async (tx) => {
      const { make } = await setup(tx);
      await make({ name: "Zyx Alpha Searchable" });
      const target = await make({ name: "Zyx Zulu Searchable", extraBarcodes: ["ZS-0001"] });
      const byBarcode = await searchItems(tx, { q: "ZS-0001", chip: "all" });
      expect(byBarcode.items[0].id).toBe(target.id);
      const byCode = await searchItems(tx, { q: target.code, chip: "all" });
      expect(byCode.items[0].id).toBe(target.id);
    });
  });

  it("filters by company, by category (including everything below it) and by status chip", async () => {
    await inRollback(async (tx) => {
      const { actor, make, company } = await setup(tx);
      const parent = await createCategory(tx, actor.id, "ZParent", null);
      const child = await createCategory(tx, actor.id, "ZChild", parent.ok ? parent.value : null);
      if (!parent.ok || !child.ok) throw new Error("setup failed");
      const inChild = await make({ name: "Zyx in child", categoryId: child.value });
      const plain = await make({ name: "Zyx no category" });
      const old = await make({ name: "Zyx old edition", status: "OLD_EDITION" });

      const parentHits = (await searchItems(tx, { categoryId: parent.value, chip: "all" })).items.map((i) => i.id);
      expect(parentHits).toEqual([inChild.id]);

      const company_ = (await searchItems(tx, { companyId: company.id, chip: "active" })).items.map((i) => i.id);
      expect(company_).toContain(inChild.id);
      expect(company_).toContain(plain.id);
      expect(company_).not.toContain(old.id);

      const oldHits = (await searchItems(tx, { companyId: company.id, chip: "old" })).items.map((i) => i.id);
      expect(oldHits).toEqual([old.id]);
    });
  });

  it("lists low-stock items using the stock movements", async () => {
    await inRollback(async (tx) => {
      const { make, company } = await setup(tx);
      const low = await make({ name: "Zyx low", minStock: 10 });
      const fine = await make({ name: "Zyx fine", minStock: 10 });
      await tx.stockMovement.create({ data: { itemId: low.id, qtyIn: 4, docType: "OPENING" } });
      await tx.stockMovement.create({ data: { itemId: fine.id, qtyIn: 50, docType: "OPENING" } });
      await tx.stockMovement.create({ data: { itemId: fine.id, qtyOut: 41, docType: "SALE" } }); // 9 left... below 10
      await tx.stockMovement.create({ data: { itemId: fine.id, qtyIn: 5, docType: "ADJUSTMENT", reason: "found" } }); // 14 left
      const hits = (await searchItems(tx, { companyId: company.id, chip: "low" })).items.map((i) => i.id);
      expect(hits).toEqual([low.id]);
    });
  });

  it("pages the results", async () => {
    await inRollback(async (tx) => {
      const { make, company } = await setup(tx);
      for (let i = 1; i <= 5; i++) await make({ name: `Zyx page ${i}` });
      const p1 = await searchItems(tx, { companyId: company.id, chip: "all", pageSize: 2 });
      const p3 = await searchItems(tx, { companyId: company.id, chip: "all", pageSize: 2, page: 3 });
      expect(p1.total).toBe(5);
      expect(p1.items).toHaveLength(2);
      expect(p3.items).toHaveLength(1);
    });
  });
});
