// Sample data for development, from the screen designs and the money tests (docs/build-plan.md).
// Run on purpose with: npm run db:seed
// It refuses to run if the database already has users, so it can never mix with real data.
import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const rs = (rupees: number) => rupees * 100; // rupees -> paisa
const pct = (percent: number) => percent * 100; // percent -> basis points

const PERMISSIONS: Record<string, string> = {
  "billing.create": "Make retail and wholesale bills",
  "billing.change_price": "Change the price on a bill line",
  "billing.cancel": "Cancel a saved bill",
  "discount.override_client": "Change a wholesale discount away from the client's agreed %",
  "items.edit": "Add and edit items and base prices",
  "client_rules.edit": "Edit client company discounts and book rules",
  "clients.edit": "Add and edit clients",
  "cost.view": "See cost price and profit",
  "purchases.manage": "Enter purchases and manage suppliers",
  "stock.adjust": "Adjust stock",
  "returns.manage": "Accept returns",
  "payments.receive": "Receive payments from clients",
  "payments.make": "Make payments to suppliers",
  "ledger.view": "See ledgers and statements",
  "expenses.manage": "Record expenses",
  "reports.view": "See reports",
  "users.manage": "Manage users and roles",
  "settings.manage": "Change system settings",
  "audit.view": "See the audit log",
};

const ROLES: { name: string; limitPct: number; permissions: string[] }[] = [
  { name: "Owner", limitPct: 100, permissions: Object.keys(PERMISSIONS) },
  {
    name: "Manager",
    limitPct: 20,
    permissions: Object.keys(PERMISSIONS).filter((p) => !["users.manage", "settings.manage"].includes(p)),
  },
  {
    name: "Cashier",
    limitPct: 5,
    permissions: ["billing.create", "payments.receive", "returns.manage"],
  },
  {
    name: "Accountant",
    limitPct: 0,
    permissions: ["ledger.view", "payments.receive", "payments.make", "expenses.manage", "reports.view", "cost.view"],
  },
];

async function main() {
  if ((await db.user.count()) > 0) {
    console.log("The database already has users. Seed skipped so real data is never mixed with samples.");
    return;
  }

  // ── Roles, permissions, users ──
  for (const [key, description] of Object.entries(PERMISSIONS)) {
    await db.permission.create({ data: { key, description } });
  }
  const roleId: Record<string, number> = {};
  for (const r of ROLES) {
    const role = await db.role.create({
      data: {
        name: r.name,
        discountLimitBp: pct(r.limitPct),
        permissions: { create: r.permissions.map((permissionKey) => ({ permissionKey })) },
      },
    });
    roleId[r.name] = role.id;
  }
  const passwordHash = await bcrypt.hash("changeme123", 10);
  const owner = await db.user.create({
    data: { username: "owner", name: "Owner", passwordHash, roleId: roleId.Owner },
  });
  await db.user.create({ data: { username: "manager", name: "Manager", passwordHash, roleId: roleId.Manager } });
  await db.user.create({ data: { username: "cashier", name: "Cashier", passwordHash, roleId: roleId.Cashier } });

  // ── Devices (each has its own bill number series) ──
  await db.device.create({ data: { name: "Counter 1", billPrefix: "C1" } });
  await db.device.create({ data: { name: "Phone 1", billPrefix: "M1" } });

  // ── Settings ──
  const settings: Record<string, unknown> = {
    "shop.name": "Nabeel Dar Book Depot",
    "shop.nameUrdu": "نبیل ڈار بک ڈپو",
    "bill.defaultLanguage": "EN",
    "stock.allowNegative": false,
    "return.windowDays": 7,
    "bill.rounding": 1,
  };
  for (const [key, value] of Object.entries(settings)) {
    await db.setting.create({ data: { key, value: value as never } });
  }

  // ── Companies ──
  const company: Record<string, number> = {};
  for (const name of ["Oxford", "Paramount", "Ilmi Kitab Khana", "Dollar", "Sang-e-Meel"]) {
    company[name] = (await db.company.create({ data: { name } })).id;
  }

  // ── Categories: Books > Textbooks > Class N, Books > Atlases ──
  const books = await db.category.create({ data: { name: "Books" } });
  const textbooks = await db.category.create({ data: { name: "Textbooks", parentId: books.id } });
  const atlases = await db.category.create({ data: { name: "Atlases", parentId: books.id } });
  const classCat: Record<number, number> = {};
  for (const n of [3, 4, 5, 6, 7, 8]) {
    classCat[n] = (await db.category.create({ data: { name: `Class ${n}`, parentId: textbooks.id } })).id;
  }

  // ── Items, one batch each (item 3307 has two), opening stock as movements ──
  type Sample = {
    code: string;
    name: string;
    nameUrdu?: string;
    company: string;
    cat: number;
    subject: string;
    classGrade?: string;
    price: number; // rupees
    cost?: number; // rupees; defaults to 72% of price
    min: number;
    batches: { price: number; received: string; qty: number }[];
  };
  const samples: Sample[] = [
    { code: "1045", name: "Oxford Primary English 5", company: "Oxford", cat: classCat[5], subject: "English", classGrade: "5", price: 850, min: 20, batches: [{ price: 850, received: "2026-09-01", qty: 118 }] },
    { code: "1101", name: "Oxford Science 6", company: "Oxford", cat: classCat[6], subject: "Science", classGrade: "6", price: 1150, min: 20, batches: [{ price: 1150, received: "2026-09-01", qty: 42 }] },
    { code: "1102", name: "Oxford Science 7", company: "Oxford", cat: classCat[7], subject: "Science", classGrade: "7", price: 1200, min: 20, batches: [{ price: 1200, received: "2026-09-01", qty: 36 }] },
    { code: "1103", name: "Oxford Science 8", company: "Oxford", cat: classCat[8], subject: "Science", classGrade: "8", price: 1280, min: 20, batches: [{ price: 1280, received: "2026-09-01", qty: 4 }] },
    { code: "1150", name: "Oxford Atlas for Pakistan", company: "Oxford", cat: atlases.id, subject: "Atlas", price: 2500, min: 5, batches: [{ price: 2500, received: "2026-09-01", qty: 11 }] },
    { code: "1240", name: "Oxford Science Workbook 7", company: "Oxford", cat: classCat[7], subject: "Science", classGrade: "7", price: 450, min: 20, batches: [{ price: 450, received: "2026-09-01", qty: 60 }] },
    {
      code: "3307",
      name: "Oxford Social Studies 4",
      nameUrdu: "آکسفورڈ معاشرتی علوم 4",
      company: "Oxford",
      cat: classCat[4],
      subject: "Social Studies",
      classGrade: "4",
      price: 780,
      cost: 552,
      min: 20,
      batches: [
        { price: 720, received: "2026-04-03", qty: 6 },
        { price: 780, received: "2026-10-02", qty: 40 },
      ],
    },
    { code: "2210", name: "Paramount Mathematics 6", company: "Paramount", cat: classCat[6], subject: "Mathematics", classGrade: "6", price: 640, min: 20, batches: [{ price: 640, received: "2026-09-01", qty: 90 }] },
    { code: "2215", name: "Paramount English 3", company: "Paramount", cat: classCat[3], subject: "English", classGrade: "3", price: 520, min: 20, batches: [{ price: 520, received: "2026-09-01", qty: 70 }] },
  ];
  const itemId: Record<string, number> = {};
  for (const s of samples) {
    const item = await db.item.create({
      data: {
        code: s.code,
        name: s.name,
        nameUrdu: s.nameUrdu,
        companyId: company[s.company],
        categoryId: s.cat,
        subject: s.subject,
        classGrade: s.classGrade,
        basePrice: rs(s.price),
        costPrice: rs(s.cost ?? Math.round(s.price * 0.72)),
        minStock: s.min,
        barcodes: { create: [{ barcode: s.code, label: "shop code" }] },
      },
    });
    itemId[s.code] = item.id;
    for (const b of s.batches) {
      const batch = await db.itemBatch.create({
        data: { itemId: item.id, price: rs(b.price), receivedDate: new Date(b.received) },
      });
      await db.stockMovement.create({
        data: {
          itemId: item.id,
          batchId: batch.id,
          date: new Date(b.received),
          qtyIn: b.qty,
          docType: "OPENING",
          userId: owner.id,
        },
      });
    }
  }
  await db.itemUnit.create({ data: { itemId: itemId["3307"], unitName: "packet of 10", factor: 10 } });

  // ── Clients ──
  const ali = await db.client.create({
    data: {
      code: "CL-0001",
      name: "Ali Traders",
      type: "WHOLESALE",
      creditLimit: rs(100000),
      termsDays: 30,
      messageLanguage: "UR",
    },
  });
  await db.client.create({
    data: {
      code: "CL-0412",
      name: "Madina Book Centre",
      type: "WHOLESALE",
      creditLimit: rs(100000),
      termsDays: 30,
      messageLanguage: "UR",
    },
  });

  // Ali Traders: company rules and book rules (Client discounts design).
  for (const [name, percent] of [["Oxford", 10], ["Paramount", 8], ["Ilmi Kitab Khana", 7], ["Dollar", 5]] as const) {
    await db.clientCompanyDiscount.create({
      data: { clientId: ali.id, companyId: company[name], discountBp: pct(percent), updatedById: owner.id },
    });
  }
  await db.clientItemRule.createMany({
    data: [
      { clientId: ali.id, itemId: itemId["1045"], discountBp: pct(12), setFrom: "Owner", updatedById: owner.id },
      { clientId: ali.id, itemId: itemId["1240"], specialPrice: rs(430), discountBp: pct(15), setFrom: "Bill C1-0987", updatedById: owner.id },
      { clientId: ali.id, itemId: itemId["2215"], discountBp: pct(6), setFrom: "Manager", updatedById: owner.id },
    ],
  });

  // Ali Traders owes Rs. 45,030 (opening balance, as a ledger row).
  await db.ledgerEntry.create({
    data: {
      partyType: "CLIENT",
      clientId: ali.id,
      debit: rs(45030),
      docType: "OPENING",
      note: "Opening balance",
      userId: owner.id,
    },
  });

  console.log("Sample data added. Log-in users: owner, manager, cashier. Password for all: changeme123");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
