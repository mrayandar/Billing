# Nabeel Dar Book Depot — Billing System

Web-based retail and wholesale billing for a book and stationery shop. Used at shop counters (keyboard + USB barcode scanner), on tablets, and on phones. The owner is building it step by step with Claude Code.

## Read first
- `docs/requirements.md` — full requirements. Every feature has an ID (PM-01, PR-03, BE-05, …). Refer to IDs in plans and commit messages.
- The "Decisions from the screen designs" table near the top of the requirements overrides anything older in that document.
- `docs/designs/` — screen designs. Match their layout, labels and keyboard flow.
- `docs/build-plan.md` — the 14 build steps and the money test cases. Work on one step at a time.

## Stack
- Next.js (App Router) + TypeScript
- PostgreSQL + Prisma
- Tailwind CSS
- Auth.js (username + password), role-based permissions
- JsBarcode for barcodes
- Noto Nastaliq Urdu font for Urdu text
- Installable web app (PWA) with offline billing (build step 12, not before)

## Commands
- Run the app: `npm run dev`
- Run tests: `npm test`
- Database changes: `npx prisma migrate dev` (or `npm run db:migrate`)

## Business rules (do not change without asking)
- **Money** is stored as integer paisa (Rs. 1 = 100). Never use floating point for money.
- **Price rule order** for a client bill line:
  1. Client book rule (special price and/or discount % for that item)
  2. Client company rule (discount % for that item's company)
  3. Base price, no discount
- "Brand" in older notes means **Company** (publisher or manufacturer).
- **Save tick on billing**: if ticked and the cashier changed the price or discount, save it as that client's book rule when the line is added. No confirmation pop-up.
- **Price batches** are automatic: bill the oldest batch first. The cashier never chooses a batch.
- A saved bill keeps the prices and discounts used at the time, even if rules change later.
- **No hard deletes** of bills, payments or purchases. Cancel them: keep the record and number, and reverse the stock and ledger effects.
- Every stock change is a row in `stock_movements`; every money change is a row in `ledger_entries`. Never overwrite a quantity or balance directly.
- Bill numbers are per device (e.g. C1-1001, M1-1001) so offline bills never clash.
- Payments are applied to the oldest open bills first unless the user chooses bills.
- Printed invoices and payment receipts show previous balance, this bill or payment, and new balance.
- Invoices print on A5 (about 11 lines on page 1, 14 on later pages; totals, balance box and signatures on the last page only). Retail receipts print on 80 mm thermal paper.
- Each bill can print in English or Urdu; Urdu uses the item's Urdu name, falling back to the English name.
- Record who did what in the audit log for prices, discounts, bills, payments and stock adjustments.

## Screens and usability
- Every screen must work on computer, tablet and phone. Stack columns on narrow screens, collapse the top menu into a menu button on phones, and let wide tables scroll or turn into cards.
- Buttons and inputs at least 44 px tall on touch screens.
- Billing must be fully usable by keyboard: code → Enter → price → Enter → qty → Enter → discount → Enter adds the line. Shortcuts: F2 code, F3 search, F4 company, F6 client, F8 hold, F9 save tick, F10 save and print, Del remove line, Esc cancel.
- Shop name: Nabeel Dar Book Depot (Urdu: نبیل ڈار بک ڈپو).

## How to work
- Before writing code, read the relevant requirement IDs and design, then write a short plan and wait for approval.
- Keep changes small and focused on the current build step.
- Write automated tests for anything involving money, stock or balances. All tests must pass before finishing.
- **Ask first** before: changing the database structure, deleting or renaming files, removing or weakening tests, adding a new library, or touching real data.
- Explain what changed in plain, simple English. The owner is not a professional developer.
- After a working change, suggest a short git commit message that mentions the requirement IDs.
