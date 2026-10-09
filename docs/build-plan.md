# Build Plan: Nabeel Dar Book Depot Billing

Build the system yourself with Claude Code in 14 steps, one module at a time, testing each before moving on; Phase 1 of the requirements is steps 0 to 13.

## 1. Before you start

- [ ] Node.js (the current LTS version)
- [ ] Git, plus a free GitHub account with a private repository for the project
- [ ] VS Code (or any code editor)
- [ ] Claude Code, signed in with your Pro account
- [ ] A PostgreSQL database: a free hosted one (Supabase or Neon) for development
- [ ] A USB barcode scanner and the thermal printer used in the shop, for testing from step 6
- [ ] `docs/requirements.md`, `docs/build-plan.md` and `docs/designs/` in the project
- [ ] `CLAUDE.md` in the project's top folder

## 2. Technology choices

| Part | Choice | Why |
| --- | --- | --- |
| App | Next.js with TypeScript | One project for screens and server; runs in any browser on computer, tablet and phone |
| Database | PostgreSQL with Prisma | Reliable for money and stock; Prisma keeps tables, changes and queries simple |
| Screens | Tailwind CSS | Fast to build responsive layouts that match the designs |
| Login | Auth.js (username and password) | Roles and permissions on top of standard login |
| Offline billing | Installable web app (PWA) with a local queue | Counters keep billing when the internet drops; bills sync later (step 12) |
| Barcodes | JsBarcode | Draws barcodes for labels and receipts |
| Printing | Browser printing with print layouts for 80 mm and A5 | No extra software; for printing without a dialog, run the counter browser in kiosk printing mode |
| Urdu | Noto Nastaliq Urdu font | Correct Urdu shapes on screen and on A5; test thermal printing early |
| Hosting | Vercel (app) + hosted PostgreSQL | Free or cheap to start, reachable from anywhere |

Money is stored as whole paisa (Rs. 1 = 100), never as decimals, so totals never drift.

## 3. Build steps

| Step | Build | Requirement IDs | Done when |
| --- | --- | --- | --- |
| 0 | Project setup: Next.js, database connection, git, test runner | — | The empty app opens in the browser and one sample test passes |
| 1 | All Phase 1 database tables, plus sample data (the books and clients from the designs) | Data model | Sample items, clients and discounts show up in the database viewer |
| 2 | Login, users, roles, permissions, audit log | US-01–04, SE-01, SE-07 | A cashier cannot open a manager-only page; every change is logged |
| 3 | Companies, categories, items with Urdu name, barcodes, units | PM-01–08, BE-01 | Add, edit and search items by code, name, ISBN or company |
| 4 | Clients, new client form, company and book rules (price and discount) and the price calculation | WS-01, PR-01–15 | The money tests in section 5 pass |
| 5 | Billing screen: code entry, Enter flow, search, company filter, history box, edit and remove lines, save tick, hold bills, save bill | RS-01–12, BE-01–12, WS-02–07 | A bill can be made with keyboard only; stock goes down; client balance goes up |
| 6 | Printing: 80 mm receipt, A5 invoice with page 2, payment receipt, English and Urdu | RS-08, WS-07, CU-02 | Test prints on the real printers match the designs |
| 7 | Suppliers, purchase entry, supplier discounts, freight, stock in, labels | PU-01–05, PU-09–12, BC-01–05 | A purchase raises stock and cost; labels print |
| 8 | Receive payment, make payment, ledgers, statements, cheques | LA-01–07, LA-14 | Paying a client's balance updates the ledger and prints previous and new balance |
| 9 | Returns against a bill | RT-01–10 | Only sold items can return, at the price paid; stock and refund are correct |
| 10 | Shifts, close shift, expenses, day closing | LA-09–13 | Counted cash vs expected shows the right difference |
| 11 | Dashboard and the main reports | RP-01–03, RP-07, RP-09, RP-12–13, RP-20 | Report totals match the bills they come from |
| 12 | Responsive pass on phone and tablet, installable app, offline billing with per-device bill numbers | NF-03–05, NF-12–15 | A bill made with the internet off appears after it comes back, with no duplicate numbers |
| 13 | Backups, go-live: import real items, clients, balances and opening stock, then one trial week | SE-04–06, PD-01–05 | A week of real bills matches your current method |

Phase 2 and 3 features come after go-live, one at a time, the same way.

## 4. Working with Claude Code

1. Start with the goal, e.g. "Do step 4 from docs/build-plan.md. Read docs/requirements.md and the Client discounts design first. Ask me anything unclear before writing code."
2. Ask for a plan first and read it. Correct it before any code is written.
3. Let it build, then run it and try the screen yourself, like a cashier would.
4. Ask for tests for anything involving money, stock or balances, and make sure they pass.
5. Save your work with git after each working piece.
6. When something breaks, paste the exact error or describe exactly what you clicked and what happened.
7. Start a fresh session for the next task.

## 5. Money tests

| # | Case | Input | Expected |
| --- | --- | --- | --- |
| 1 | Company rule | Ali Traders, Oxford Science 7, base 1,200, Oxford 10%, qty 15 | 16,200 |
| 2 | Book rule beats company rule | Ali Traders, Oxford Primary English 5, base 850, book rule 12%, qty 20 | 14,960 |
| 3 | No rule | Walk-in, Oxford Science 6, base 1,150, qty 1 | 1,150 |
| 4 | Book special price and discount | Ali Traders, Oxford Science Workbook 7, special price 430, 15%, qty 10 | 3,655 |
| 5 | Save tick on | Paramount Mathematics 6 changed from 8% to 10% with the tick, then billed again: 25 × 640 | 14,400 on the next bill |
| 6 | Save tick off | Same change without the tick, then billed again | 14,720 on the next bill (8% again) |
| 7 | Bill totals and balance | Gross 67,100, discount 6,870, delivery 500, previous balance 24,300, received 40,000 | This bill 60,730; new balance 45,030 |
| 8 | Payment, oldest bills first | Balance 45,030 (C1-0987 open 24,300, C1-1042 open 20,730); receive 25,000 | C1-0987 fully paid, 700 to C1-1042; new balance 20,030 |
| 9 | Return at price paid | Bill C1-1011, return 1 × Oxford Science 6 | Refund 1,150; stock +1 |
| 10 | Shift cash | Opening 5,000, cash sales 31,050, refunds 1,150, expenses 700, counted 34,180 | Expected 34,200; short by 20 |
| 11 | Long invoice | The 16-line City School Book Depot order | Gross 455,300, discount 52,036, with delivery 1,500 this invoice 404,764 |

## 6. Risks

| Risk | What to do |
| --- | --- |
| A wrong total or balance goes unnoticed | Keep the money tests passing; compare the first weeks' totals by hand |
| Losing data | Daily automatic backup from step 13, plus a copy you keep yourself; test restoring once |
| Urdu does not print on the thermal printer | Test in step 6 before anything else; print Urdu as an image if needed |
| Offline billing is the hardest part | Leave it for step 12, after everything else works online |
| The project grows too big for one session | One step per session; refer to step numbers and requirement IDs |
| Going live in admission season | Go live in a quiet month, after the trial week |
| Something breaks after an update | Commit with git after each working piece, so any change can be undone |
