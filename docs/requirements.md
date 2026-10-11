# Book Shop Billing System: Requirements

Oct 9, 2026 · @Rayan

The system runs retail and wholesale billing for a book and stationery shop, with one base price per item and separate brand and book discounts for each client.

## Decisions from the screen designs (10 Oct 2026)

These decisions, made while designing the screens, override anything older in this document. The screens are on the design canvas, Book Shop Billing Screens.

| Topic | Decision |
| --- | --- |
| Shop name | Nabeel Dar Book Depot, with the Urdu name on receipts, invoices and the login screen. |
| Brand is now Company | Every item belongs to a company (publisher or manufacturer). Wherever this document says brand, read company. |
| Client book rules | A client can have a special price, a discount %, or both on a single book. A book rule overrides the company discount; everyone else still pays the base price. |
| Saving from a bill | One tick on the bill, "Save this price and discount for \[client\]". When ticked, a changed price or discount is saved as that client's book rule as soon as the line is added. No confirmation question. |
| Price batches | Kept, but automatic: billing always sells the oldest copies first. The cashier never picks a batch. |
| Billing layout | Client bar, item entry and bill lines on the left; item history and search on the right; totals and payment along the bottom. |
| Item history | When an item is picked for a client, the screen shows the last sales of that item to that client: date, quantity, price, discount and net rate. |
| Phone billing | Full retail and wholesale billing works on a phone. |
| Screens designed | Billing (computer, phone, clickable), dashboard, purchase entry, suppliers, items, labels, clients and discounts, new client, customer requests, returns, client ledger, expenses, close shift, stock, reports, settings and users, login, receipt, invoice. |
| Invoice paper | Wholesale invoices and payment receipts print on A5. Retail receipts print on 80 mm thermal paper. |
| Payments later | Receive payment (from a client) and Make payment (to a supplier) screens. The amount is applied to the oldest open bills first, to bills the user picks, or just to the balance. Cheques stay pending until cleared; extra money becomes an advance. |
| Previous and new balance | Shown on both payment screens and printed on both the invoice and the payment receipt: previous balance, this bill or payment, and new balance. |
| Urdu names and printing | Every item has an optional Name in Urdu field. Each bill can be printed in English or Urdu (default set in Settings, per client if needed); an Urdu printout uses the Urdu name, falling back to the English name when none is entered. Test Urdu printing on the real thermal printer first. |
| Responsive | Every screen works on computer, tablet and phone. Columns stack on narrow screens, the top menu collapses into a menu button on phones, wide tables scroll sideways or turn into cards, and buttons stay at least 44 px tall for touch. |
| Who builds it | The owner, using Claude Code, phase by phase from this document and the screen designs. |

## Features kept from the current billing software (11 Oct 2026)

Everything the shop's current billing screen does must work in the new system from Phase 1. These requirements come from the current software and override anything that conflicts.

| ID | Requirement | Details |
| --- | --- | --- |
| OS-01 | Letter-and-number item codes | Codes like Ked11, HS8 or Oi9, up to 12 characters, not case-sensitive when typed. Existing codes are kept when items are imported. A number is auto-assigned only when the code is left blank. Codes stay unique, are never reused, and never equal another item's barcode. |
| OS-02 | Open past bills | Billing has three tabs, as in the current software (Alt+1/2/3). New bill: make a bill. Previous / Next: step through saved bills with First / Previous / Next / Last and PgUp / PgDn, filtered by all, retail, wholesale, credit, quotations or this counter. Find bill: search by bill number or scanned receipt barcode, client, phone, date range, approximate amount, item, type and paid or open; a bill number plus Enter opens it at once. Old bills always open read-only under a "viewing saved bill" banner, with Reprint, WhatsApp, Return items and Copy to new bill; Edit and Cancel need a manager and are logged (SE-02, SE-03). |
| OS-03 | Bill header fields | Type (sale, quotation, sales order), date, cash or credit, delivery mode (counter, delivery, courier), store (sale point or godown), and an "Update stock" switch (on by default; off only with permission). |
| OS-04 | Client header | Client code and name, phone, previous balance, balance with this bill, and credit limit, all visible while billing. |
| OS-05 | Fill from a list | Add all items at once from a school book list (syllabus), a quotation or sales order, or a purchase, using the client's prices. School book lists (RS-13) move to Phase 1. |
| OS-06 | Change discount on many lines | Set one discount % on all lines, one company's lines, or selected lines in one action. Optionally also save it as the client's company discount. |
| OS-07 | Where prices come from | Per bill, fill price and discount from the client's rules (default), from the last sale of that item to this client, or base price with no discount. Replaces the old Skip Bill History and Skip Disc History ticks. |
| OS-08 | Negative stock | An "Allow sale below zero stock" tick, controlled by a permission and a setting. Stock below zero shows in red. |
| OS-09 | Repeat scan | Optional setting: scanning or typing the same code again adds to that line's quantity instead of a new line. |
| OS-10 | Cost and margin while billing | Cost price and margin % of the current item, shown only to users with cost.view. |
| OS-11 | Bill totals | No. of titles and total quantity, gross total, line discounts, bill discount %, freight or delivery, rounding, grand total, received now, and new balance. |
| OS-12 | Print choices | A5 invoice, 80 mm thermal, or A5 without header for pre-printed paper; English or Urdu; a "Without balance" tick that hides previous and new balance on that printout; send on WhatsApp or SMS. |
| OS-13 | Remarks | A remarks box per bill, printed on the bill. |
| OS-14 | Item search filters | Search by company and by category together. |
| OS-15 | Data from the old software | Import items with their existing codes, clients with codes and balances, and suppliers with balances from an export of the current software. Opening stock comes from a physical count, not from the old figures, because the old system allowed negative stock. |

## 1. Purpose and scope

The system replaces manual billing and registers for one shop selling books of all kinds and stationery, to walk-in customers (retail) and account clients (wholesale).

**In scope**

- Item catalogue for books and stationery, organized by brand (publisher or manufacturer) and category
- One base price per item, with discounts set per wholesale client by brand or by individual book
- Retail counter billing (POS) and wholesale invoicing, including credit sales
- Purchase entry, supplier records and stock control
- Returns with verification against the original bill
- Customer and supplier ledgers, cash book and expenses
- Barcode generation and label printing
- Sales, stock, profit and account reports
- User roles, audit trail and backups

**Out of scope for now**

- Online store or e-commerce orders
- Full double-entry accounting (balance sheet, trial balance); ledgers cover receivables, payables and cash only
- Payroll

All amounts are in Pakistani rupees (Rs.).

## 2. Users and roles

Four roles cover the shop; the owner can adjust what each role may do.

| Role | Can do | Cannot do (by default) |
| --- | --- | --- |
| Owner | Everything, including settings, users, prices, discounts and deleting records | — |
| Manager | Billing, purchases, returns, stock adjustments, client discounts, all reports | Manage users, change system settings |
| Cashier | Retail and wholesale billing, receive payments, hold bills, print labels | Edit base prices or client discounts, delete bills, give discounts above the limit, see cost and profit |
| Accountant | Ledgers, payments, expenses, cash book, account reports | Billing, stock adjustments, price changes |

| ID | Requirement |
| --- | --- |
| US-01 | Each user logs in with their own username and password. |
| US-02 | Permissions are set per role, and the owner can tick or untick individual permissions. |
| US-03 | Every bill, payment and change records the user who made it. |
| US-04 | Actions above a user's limit (large discount, return without bill, bill edit) ask for manager or owner approval on the spot. |

## 3. System overview

&#91;embedded content: Module overview\]

Purchases bring stock in and add to supplier balances; sales take stock out and add to client balances; reports read from all of them.

## 4. Product master

Every book and stationery item is one record with a brand, a category, a base price and its stock; all other modules read from it.

| ID | Requirement | Details |
| --- | --- | --- |
| PM-01 | Item record | Name, unique short item code (BE-01), barcode(s), brand, category, base price, cost price, unit, minimum stock level, active / inactive. |
| PM-02 | Book fields | ISBN, title, author, publisher (the brand), edition and year, language, class / grade, subject, board or syllabus. |
| PM-03 | Stationery fields and variants | Colour, size, ruling, page count. Each variant (e.g., a blue gel pen and a black gel pen) is its own item with its own stock and barcode. |
| PM-04 | Brands | One list of brands: publishers for books, manufacturers for stationery. Every item belongs to exactly one brand. |
| PM-05 | Categories | A tree of any depth, e.g., Books → Textbooks → Class 9 → Physics. Used for search and reports, not for discounts. |
| PM-06 | Units and conversions | Each item has a base unit (piece) and optional larger units, e.g., 1 box = 12 pieces, 1 carton = 12 boxes. Purchases and sales can use any unit; stock is kept in the base unit. |
| PM-07 | Multiple barcodes | An item can carry several barcodes: the maker's barcode, the ISBN and a shop-generated code. Scanning any of them finds the item. |
| PM-08 | Fast search | Find items by name, code, barcode, ISBN, author, brand or category, with results as you type. |
| PM-09 | Old and discontinued items | Mark an item as old edition or discontinued. It no longer appears in new bills by default, but its history and remaining stock stay. |
| PM-10 | Bulk import and update | Import items from an Excel / CSV file and bulk-update prices, e.g., raise all Oxford base prices by 10%. |
| PM-11 | Price history | Every base price change is stored with the old price, new price, date and user. |
| PM-12 | Price batches | Stock of one item can sit at more than one printed price (e.g., old copies at Rs. 800, a reprint at Rs. 900). Each batch keeps its own price and quantity. A purchase at a new price creates a new batch; the item's base price becomes the newest batch price. Billing takes the oldest batch first automatically, and labels print each batch's price with a batch barcode. |
| PM-13 | Urdu search | Search Urdu titles in Urdu, or find them by typing an English-letter spelling stored with the item (e.g., "Bang-e-Dra"). |
| PM-14 | Publisher price list import | Import a publisher's yearly price list (Excel) matched by ISBN or item code. A preview shows old and new prices, new titles and unmatched rows before anything is applied; new prices apply to new batches (PM-12). |

## 5. Pricing and discounts

Each item has one base price for everyone; wholesale clients get their own discount %, set by brand with exceptions for individual books.

When an item goes on a wholesale client's bill, the system picks the discount in this order and uses the first match:

1. **Client + specific book**: e.g., C1 gets 12% on "Oxford Primary English 5"
2. **Client + brand**: e.g., C1 gets 10% on all other Oxford books, C2 gets 8%
3. **Nothing set**: no discount, full base price

| Book (Oxford) | Base price (Rs.) | C1 rule | C1 pays (Rs.) | C2 rule | C2 pays (Rs.) |
| --- | --- | --- | --- | --- | --- |
| English 5 | 850 | Book: 12% | 748 | Brand: 8% | 782 |
| Science 7 | 1,200 | Brand: 10% | 1,080 | Brand: 8% | 1,104 |
| Atlas | 2,500 | Brand: 10% | 2,250 | Book: 5% | 2,375 |

| ID | Requirement | Details |
| --- | --- | --- |
| PR-01 | One base price | Each item has a single base price used for every customer (per price batch where batches exist, PM-12). Changing it updates all future bills for all clients at once. |
| PR-02 | Client brand discount | For each wholesale client, set a discount % per brand. One entry covers every item of that brand. |
| PR-03 | Client book discount | For each wholesale client, set a special price and/or a discount % on a specific item. It overrides that client's brand discount for that item only. |
| PR-04 | Isolation | A discount set for one client never affects any other client or the base price. |
| PR-05 | No category discounts | Discounts are set by company or by item only. |
| PR-06 | Retail pricing | Retail bills use the base price. The cashier can give a line or whole-bill discount, as a % or a fixed amount. |
| PR-07 | Cashier discount limit | Each role has a maximum discount %. Anything above it needs manager or owner approval. |
| PR-08 | Below-cost warning | The bill warns when a line's final price is below the item's cost price. |
| PR-09 | Discount source on bill | Each line on screen shows where its discount came from: book rule, brand rule or manual. |
| PR-10 | Client discount screen | Pick a client and see all brands with their % in one editable list, plus that client's book exceptions. |
| PR-11 | Copy discounts | Create a new client's discounts by copying another client's, then adjust. |
| PR-12 | Discount history | Every change to a client's discounts is stored with the date and user. |
| PR-13 | Locked bill prices | A saved bill keeps the prices and discounts used at the time, even if they change later. |
| PR-14 | Discount on batch price | When an item has price batches, the client's discount applies to the price of the batch being sold. |
| PR-15 | Override client discount | Changing a wholesale line's discount away from the client's agreed % needs the "override client discount" permission (or approval on the spot). The override is marked on the line, logged, and listed in the discounts report (RP-15). |

## 6. Retail sales (POS)

The counter screen is built for speed: scan, adjust, take payment and print in a few keystrokes.

| ID | Requirement | Details |
| --- | --- | --- |
| RS-01 | Barcode billing | Scanning a barcode adds the item; scanning it again raises the quantity. |
| RS-02 | Manual entry | Add items by item code, by search or by brand, as set out in Item entry on the bill below (BE-01 to BE-10). |
| RS-03 | Walk-in customers | No account needed. Optionally record a name and phone number. |
| RS-04 | Discounts | Line or bill discount as % or amount, within the cashier's limit (PR-07). |
| RS-05 | Hold and resume | Park a bill to serve the next customer and recall it later. Several bills can be held at once. |
| RS-06 | Payment modes | Cash, card, bank transfer and mobile wallet, including split payment across modes. |
| RS-07 | Change calculation | Enter cash received; the screen shows the change to return. |
| RS-08 | Receipt printing | Thermal receipt (80 mm) with shop name, bill number, date, items, discount, total, payment mode and return policy line. |
| RS-09 | Keyboard shortcuts | Common actions (new bill, pay, hold, search, print) have keys so the cashier needs no mouse. |
| RS-10 | Stock check | Show available stock while billing and warn when selling more than is in stock. |
| RS-11 | Bill numbering | Automatic, sequential bill numbers that cannot be reused. |
| RS-12 | Reprint | Reprint any past receipt, marked as a duplicate. |
| RS-13 | School book sets | Sell a predefined set (e.g., "Class 5 set for School X") in one scan; the set expands into its items on the bill and in stock. |

### Item entry on the bill (retail and wholesale)

The cashier adds items by typing a short item code, by searching, or by picking a brand first, and moves through price, quantity and discount with the Enter key alone.

1. Type the item code (or scan the barcode) in the code field and press Enter.
2. The item appears in the entry row and the cursor jumps to **price**, filled with the base price. Press Enter to accept or type a new price (if allowed).
3. The cursor moves to **quantity**, filled with 1. Type the quantity and press Enter.
4. The cursor moves to **discount**, filled with the client's discount (or 0 for retail). Change it if needed and press Enter.
5. The line is added to the bill and the cursor returns to the code field for the next item.

| ID | Requirement | Details |
| --- | --- | --- |
| BE-01 | Item code | Every item has a unique short code (e.g., 1045), assigned automatically when the item is created and editable by the owner. |
| BE-02 | Code entry | Typing a code and pressing Enter loads the item into the entry row; an unknown code shows a clear message and keeps the cursor in the code field. |
| BE-03 | Enter-key flow | Code → price → quantity → discount → line added, each step with Enter, as in the steps above. No mouse needed. |
| BE-04 | Search field | A separate search box where the cashier types part of a name, author or ISBN; matching items list as they type, and arrow keys + Enter pick one into the entry row. |
| BE-05 | Search within a brand | The cashier first picks a brand (by typing its name), then searches; only that brand's items appear. The brand stays selected until cleared. |
| BE-06 | Barcode in the same field | A scanned barcode goes into the code field and works exactly like a typed code. |
| BE-07 | Edit a line | Before saving, select any line on the bill (click or arrow keys) to change its price, quantity or discount, then press Enter to update it. |
| BE-08 | Remove or replace a line | Delete a wrong line with one key, or replace its item while keeping the quantity. Stock changes only when the bill is saved. |
| BE-09 | Price change permission | Changing the price in the entry row follows the user's role; a cashier without permission skips the price step. |
| BE-10 | After saving | Changing a saved bill follows SE-03 (permission and audit log). |
| BE-11 | Last price shown | When an item is loaded for a client, show the price and discount they got for it last time and when; users allowed to see cost also see the last purchase rate. |
| BE-12 | Batch choice | If an item has more than one price batch in stock, billing sells the oldest batch first automatically; the cashier does not choose. A scanned batch barcode selects that batch directly. |

## 7. Wholesale sales and quotations

Wholesale invoices are made against a client account, apply that client's discounts automatically and can be paid now or later.

| ID | Requirement | Details |
| --- | --- | --- |
| WS-01 | Client records | Name, shop or institution name, phone, address, client type, credit limit, payment terms (e.g., 30 days), opening balance, notes. |
| WS-02 | Automatic discounts | Selecting the client applies their book and brand discounts to every line (section 5). |
| WS-03 | Bulk units | Sell by piece, box, dozen or carton; the price follows the unit conversion. |
| WS-04 | Credit sales | Save an invoice as unpaid or partly paid; the balance goes to the client's ledger. |
| WS-05 | Credit limit check | Warn, or block with approval, when an invoice would take the client above their credit limit. |
| WS-06 | Previous balance on invoice | The invoice shows the client's previous balance, this invoice and the new total due. |
| WS-07 | A4 invoice | Printable and PDF invoice with shop details, client details, items, discount per line, totals and terms. |
| WS-08 | Quotations | Make a quotation with the client's prices, print or share it, and convert it to an invoice in one step. Quotations do not affect stock. |
| WS-09 | Sales orders | Record an order to be delivered later (e.g., a school's book order), reserve stock, and invoice in one or more deliveries. |
| WS-10 | Delivery note | Print a delivery challan without prices for goods sent before invoicing. |
| WS-11 | Share invoice | Send the invoice PDF by WhatsApp or email. |
| WS-12 | Charges on invoices | Add delivery, packing, carriage or other charges to an invoice as separate lines, outside the item discounts; they appear on the invoice and in the client's ledger. |

### Customer demand and pre-orders

Books customers ask for but the shop does not have are recorded, ordered and handed over, so no request is forgotten.

| ID | Requirement | Details |
| --- | --- | --- |
| DO-01 | Demand register | Record a requested title (from the catalogue or typed in if new), quantity, customer name and phone, and date. Works for retail and wholesale customers. |
| DO-02 | Pre-order with advance | Take an advance payment against a request; the advance is held on the customer's account and deducted when the book is billed. |
| DO-03 | Order from demand | Group open requests by supplier and turn them into a purchase order. |
| DO-04 | Arrival notice | When a requested book is received in a purchase entry, show the waiting customers and send them a WhatsApp or SMS message (template CU-16). |
| DO-05 | Demand report | Most-requested titles not in stock, open and fulfilled requests, and advances held. |

## 8. Purchases and suppliers

Every stock arrival is entered against a supplier invoice, which raises stock, updates cost and adds to the supplier's balance.

| ID | Requirement | Details |
| --- | --- | --- |
| PU-01 | Supplier records | Name, company, phone, address, brands supplied, payment terms, opening balance. |
| PU-02 | Purchase entry | Supplier, supplier invoice number and date, items, quantity, unit, purchase rate or discount off base price, freight and other charges. |
| PU-03 | Stock and cost update | Saving a purchase adds stock and updates the item's cost price (weighted average cost). |
| PU-04 | Base price update | Optionally update an item's base price during purchase entry, e.g., when a new edition has a new printed price. |
| PU-05 | Payment status | Mark a purchase as paid, partly paid or unpaid; the balance goes to the supplier's ledger. |
| PU-06 | Purchase orders | Create an order to a supplier, then receive it fully or in parts into a purchase entry. |
| PU-07 | Purchase returns | Return items to a supplier against the purchase; stock and the supplier balance reduce. |
| PU-08 | Consignment stock | Record books received on sale-or-return. They are sold like normal stock, but the supplier is owed only for copies sold, and unsold copies are returned and settled. |
| PU-09 | Labels from purchase | Print barcode labels for the items and quantities just received (section 12). |
| PU-10 | Duplicate check | Warn when the same supplier invoice number is entered twice. |
| PU-11 | Supplier brand discounts | Set a default discount % per supplier and brand (with optional per-item exceptions). Purchase entry fills the rate as base price minus that discount; the user can change it. |
| PU-12 | Freight in item cost | Spread freight and other purchase charges across the items of that purchase, by value or by quantity, so each item's cost and profit include them. |

## 9. Stock management

Stock moves only through recorded transactions, so the count on screen always explains itself.

| ID | Requirement | Details |
| --- | --- | --- |
| ST-01 | Real-time stock | Sales, purchases, returns and adjustments update stock immediately. |
| ST-02 | Stock ledger per item | For any item, list every movement in and out with date, document number, quantity and running balance. |
| ST-03 | Low-stock alerts | Show items at or below their minimum level. |
| ST-04 | Reorder list | Low-stock items grouped by supplier, convertible into purchase orders. |
| ST-05 | Stock adjustment | Increase or decrease stock with a required reason (damaged, lost, found, count correction) and the user recorded. |
| ST-06 | Damaged stock | Damaged items move to a separate damaged quantity, not sellable, until written off or returned to the supplier. |
| ST-07 | Physical stock count | Count items by scanning, compare with system stock, review differences and post approved corrections as adjustments. |
| ST-08 | Locations | Track stock in more than one place (e.g., shop and godown) and record transfers between them. |
| ST-09 | Opening stock | Enter starting quantities and costs when the system goes live. |
| ST-10 | Negative stock setting | The owner chooses whether sales below zero stock are blocked or allowed with a warning. |
| ST-11 | Reserved and available stock | Stock shows three figures: on hand, reserved (by open sales orders and paid pre-orders) and available = on hand − reserved. Billing checks available stock; a reservation is released when its order is delivered or cancelled. |
| ST-12 | Damaged stock write-off | Write off damaged stock with approval; the loss is recorded at cost and appears in the write-off report (RP-18). |
| ST-13 | Stock by batch | Stock, counts and adjustments are kept per price batch (PM-12) as well as per item. |

## 10. Returns and verification

A return is accepted against the original bill, at the price actually paid, so nothing can be returned that was not sold.

| ID | Requirement | Details |
| --- | --- | --- |
| RT-01 | Find the bill | Scan the receipt barcode or enter the bill number, or search by client, date or phone. |
| RT-02 | Verify items | Only items on that bill can be returned, up to the quantity sold minus anything already returned. |
| RT-03 | Original price | The refund uses the price and discount on the original bill, not today's price. |
| RT-04 | Return window | For retail returns, a set number of days (e.g., 7); older returns need manager approval. Wholesale season-end returns follow RT-11. |
| RT-05 | Item condition | Mark each returned item as good (back to sellable stock) or damaged (to damaged stock). |
| RT-06 | Refund method | Cash refund, credit note, or exchange for other items in the same transaction. Wholesale returns credit the client's ledger. |
| RT-07 | Credit notes | A numbered credit note that can be used against a future bill; its balance is tracked. |
| RT-08 | Return without bill | Allowed only with manager approval, at the current price or a price the manager sets, with a reason. |
| RT-09 | Return receipt | Print a return slip showing the original bill number, items, amount and refund method. |
| RT-10 | Return reasons | Record a reason (wrong item, damaged, duplicate, not needed) for reports. |
| RT-11 | Wholesale season-end returns | A client can return unsold stock in bulk against their account instead of bill by bill. The system checks each item against the quantity that client bought in the chosen period minus earlier returns, credits it at the client's net price on their latest purchases of that item, and sends it back to stock. A return deadline is set per client or for everyone (e.g., by 31 May); later returns need owner approval. |

## 11. Ledgers and accounts

The system tracks who owes the shop, whom the shop owes, and where every rupee of cash went each day.

| ID | Requirement | Details |
| --- | --- | --- |
| LA-01 | Customer ledger | Per client: opening balance, invoices, payments received, returns and credit notes, with running balance. |
| LA-02 | Supplier ledger | Per supplier: opening balance, purchases, payments made and purchase returns, with running balance. |
| LA-03 | Receive payment | Record a payment from a client against specific invoices or against the overall balance, by any payment mode. |
| LA-04 | Make payment | Record a payment to a supplier the same way. |
| LA-05 | Cheques | Record cheque number, bank and date; track cheques as pending, cleared or bounced. A bounced cheque reverses the payment. |
| LA-06 | Aging | Client balances split by age: 0–30, 31–60, 61–90 and over 90 days. |
| LA-07 | Statements | Print or share an account statement for any client or supplier for a date range. |
| LA-08 | Payment reminders | Send a balance reminder to a client by WhatsApp or SMS. |
| LA-09 | Expenses | Record expenses (rent, salaries, electricity, transport) by head, with payment mode. |
| LA-10 | Cash book | Daily cash in and out from sales, payments, refunds and expenses. |
| LA-11 | Day closing | Opening cash + cash in − cash out = expected cash. The cashier enters counted cash; any difference is recorded with the user. |
| LA-12 | Bank and wallet accounts | Track balances of bank accounts and mobile wallets that receive payments. |
| LA-13 | Shifts per counter | Each cashier opens a shift on a counter or phone with an opening cash amount. Every cash sale, refund, payment and expense is tied to that shift. At shift end the cashier enters counted cash and any difference is recorded; a cash handover to the owner is logged. Day closing (LA-11) totals all shifts. |
| LA-14 | Advance payments | Record money received from a client before any invoice; it shows as a credit on their ledger and is used against later invoices. |
| LA-15 | Write-offs and settlement discount | Write off a bad debt or a small leftover balance, or give a discount when a client settles their account, with owner approval and a reason. |

## 12. Barcodes and labels

Items that already carry a barcode or ISBN use it; everything else gets a shop code and a printed label.

| ID | Requirement | Details |
| --- | --- | --- |
| BC-01 | Use existing codes | Read the maker's barcode (EAN-13 / UPC) and ISBN directly. |
| BC-02 | Generate codes | Create a unique internal code (Code 128) for items without one, automatically on item creation. |
| BC-03 | Label content | Item name (shortened), barcode, price and optionally brand or shop name. |
| BC-04 | Label templates | Layouts for common A4 label sheets and for thermal label printers, with adjustable size. |
| BC-05 | Bulk printing | Print labels for a purchase entry, a brand, a category, or a hand-picked list, with a quantity per item. |
| BC-06 | Price change labels | List items whose base price changed since a date, to reprint their labels. |
| BC-07 | Receipt barcode | Each receipt carries a barcode of its bill number, used for returns (RT-01). |

## 13. Reports

Every report filters by date range and, where it applies, by brand, category, client, supplier or user, and exports to PDF and Excel.

| ID | Report | Shows |
| --- | --- | --- |
| RP-01 | Daily sales summary | Bills, retail vs wholesale totals, discounts, returns, net sales and payments by mode. |
| RP-02 | Sales by item / brand / category | Quantity and value sold, grouped as chosen. |
| RP-03 | Sales by client | Invoices, value and discount given per client. |
| RP-04 | Sales by user | Bills and value per cashier, plus discounts and returns they handled. |
| RP-05 | Profit | Sales minus cost, by item, brand, category, client and period. Owner and manager only. |
| RP-06 | Best and slow sellers | Top items by quantity or value; items with no sale in a chosen number of days. |
| RP-07 | Stock on hand | Current quantity per item, with value at cost and at base price. |
| RP-08 | Stock movement | Opening, in, out and closing quantity per item for a period. |
| RP-09 | Low stock and reorder | Items at or below minimum, by supplier. |
| RP-10 | Purchases | By supplier, item and period; purchase returns. |
| RP-11 | Returns | By item, reason, user and period; refunds by method. |
| RP-12 | Receivables and payables | Balances owed by clients and to suppliers, with aging. |
| RP-13 | Cash book and day closing | Daily cash summary and any differences at closing. |
| RP-14 | Expenses | By head and period. |
| RP-15 | Discounts given | Manual discounts by user and client discounts by client, with approvals. |
| RP-16 | Season comparison | Sales of a period this year against the same period last year, by brand and category. |
| RP-17 | Dashboard | Today's sales, month to date, top items, low stock count and amounts due, on the home screen. |
| RP-18 | Damaged and write-offs | Damaged stock, stock write-offs at cost, and debt write-offs, by item, reason, user and period. |
| RP-19 | Daily owner summary | At day closing, send the owner a WhatsApp summary: sales, returns, cash, shift differences, payments received and low-stock count. |
| RP-20 | Shift report | Per shift: opening cash, sales by payment mode, refunds, expenses, expected and counted cash, and difference. |

## 14. Security, audit and backup

Nothing is silently changed or lost: edits are logged, deletions are reversible, and data is backed up daily.

| ID | Requirement | Details |
| --- | --- | --- |
| SE-01 | Audit log | Records who created, edited or cancelled any bill, payment, purchase, price or discount, with old and new values and time. |
| SE-02 | No hard deletes | Bills are cancelled, not deleted; a cancelled bill stays visible, reverses its stock and ledger effect and keeps its number. |
| SE-03 | Bill edit control | Editing a saved bill needs permission and keeps the original version in the audit log. |
| SE-04 | Automatic backup | A full backup at day closing and at a set time each day, kept for at least 30 days. |
| SE-05 | Off-site copy | Backups are also copied to a USB drive or cloud storage. |
| SE-06 | Restore | The owner can restore from a chosen backup. |
| SE-07 | Auto logout | Log out after a set idle time. |
| SE-08 | Financial year | Close a year and start the next with carried-forward balances and stock, keeping old years viewable. |
| SE-09 | Password reset | The owner can reset any user's password; the owner resets their own by a code sent to their registered phone or email. |
| SE-10 | Two-step login | The owner, and any user logging in from outside the shop, confirms login with a one-time code on their phone. |

## 15. Non-functional requirements

The system must keep the counter moving: fast at billing, reachable from a browser on any computer or phone, and simple for staff to learn.

| ID | Requirement | Details |
| --- | --- | --- |
| NF-01 | Speed | A scanned or typed item appears on the bill in under 1 second; a bill saves and prints in under 2 seconds. |
| NF-02 | Size | Handles at least 100,000 items and 1,000,000 bills without slowing down. |
| NF-03 | Web application | Runs in a web browser (Chrome, Edge) on shop computers; nothing to install on each machine. |
| NF-04 | Mobile access | Works on mobile phones through the phone's browser, with screens that fit a small display. Everything available on a computer is available on a phone, including full retail and wholesale billing, returns, payments, purchases, reports and approvals. |
| NF-05 | Internet outages | Billing at the counter keeps working during an internet outage, either by running the server on the shop network or by an offline mode that syncs when the connection returns (see open questions). |
| NF-06 | Multiple counters | Two or more computers and phones can use the system at the same time, sharing one database. |
| NF-07 | Hardware from the browser | Works with USB barcode scanners, 80 mm thermal printers, A4 printers, label printers and a cash drawer, printing directly from the browser without a print dialog at the counter. |
| NF-08 | Secure access | All access over HTTPS with login; the owner can limit which users may log in from outside the shop, and see and end active sessions. |
| NF-09 | Ease of use | A new cashier can make a retail bill after 15 minutes of training. |
| NF-10 | Language | English interface; book titles and names can be entered in Urdu. Urdu interface optional. |
| NF-11 | Data safety | A dropped connection or power cut during saving never leaves a half-saved bill. |
| NF-12 | Phone billing screen | A billing layout made for a phone: large item code field, search and brand filter, a scrollable bill, and the same Enter-key flow (BE-03) using the phone keyboard's Next / Go key. |
| NF-13 | Phone camera scanning | Scan an item barcode or a receipt barcode with the phone's camera instead of a scanner. |
| NF-14 | Phone printing and sharing | Print receipts to a Bluetooth thermal printer, or share the bill as a PDF on WhatsApp straight from the phone. |
| NF-15 | Offline bill numbering | Each counter and phone has its own bill number series (e.g., C1-1001, C2-1001, M1-1001), so bills made offline on different devices never clash. Bills keep their numbers when they sync, and stock conflicts found on sync are listed for review. |

## 16. Customization and settings

The owner can change how the system looks and behaves from a settings screen, without a developer; every settings change is recorded in the audit log.

| ID | Requirement | Details |
| --- | --- | --- |
| CU-01 | Shop profile | Shop name, logo, address, phone numbers, tax number, and the footer and return-policy text printed on documents. |
| CU-02 | Receipt and invoice layouts | Choose paper size (58 mm, 80 mm, A4, A5), which fields and columns appear (logo, discount column, previous balance, barcode, QR code), font size and Urdu text. Separate layouts for retail receipts, wholesale invoices, quotations, returns and delivery notes. |
| CU-03 | Label designer | Place and size the fields on a barcode label (name, code, price, brand, shop name) and save several label layouts. |
| CU-04 | Document numbering | Prefix and starting number for each document type (e.g., R-1001 retail, W-501 wholesale, Q- quotations), with optional yearly reset. |
| CU-05 | Custom item fields | Add your own fields to items, optionally per category (e.g., binding, paper weight, class), usable in search, reports and labels. |
| CU-06 | Custom client and supplier fields | Add your own fields to clients and suppliers (e.g., school name, area, salesman). |
| CU-07 | Bill entry flow | Choose which steps the cursor stops at (price, quantity, unit, discount), the default quantity, and what Enter does at the last step. Set per user if needed. |
| CU-08 | Keyboard shortcuts | Change the keys assigned to billing actions. |
| CU-09 | Billing screen columns | Show, hide and reorder bill columns (code, name, brand, stock, unit, price, discount, total). |
| CU-10 | Custom roles and limits | Create roles beyond the four default ones, tick each permission, and set discount limits per role or per user. |
| CU-11 | Business rules | Switch on or off and set values for: negative stock, return window days, credit limit warn or block, below-cost warning, bill total rounding (to Rs. 1, 5 or 10), and which actions need approval. |
| CU-12 | Editable lists | Payment modes, expense heads, return reasons, stock adjustment reasons, units, locations and client types. |
| CU-13 | Tax settings | Tax on or off, rates by item or category, prices inclusive or exclusive of tax. |
| CU-14 | Custom reports | Pick columns, filters, grouping and sorting on any report and save it as a named report. |
| CU-15 | Dashboard | Choose which figures and lists appear on the home screen, per user. |
| CU-16 | Message templates | Edit the WhatsApp and SMS text for invoices, statements and payment reminders, with placeholders such as client name, amount due and bill number. |
| CU-17 | Appearance and language | Light or dark theme, text size, and English or Urdu interface, per user. |
| CU-18 | User preferences | Each user's default screen, printer, location and bill type (retail or wholesale). |
| CU-19 | Import and export | Excel templates to import items, clients, suppliers and opening balances; export any list or report to Excel. |
| CU-20 | Settings copy | Export all settings to a file and import them into another installation or branch. |
| CU-21 | Tax by item type and FBR integration | Tax rules can differ by item type (e.g., books and stationery treated differently). If the shop is required to integrate with FBR's point-of-sale system, each sale is reported to FBR and the receipt prints the FBR invoice number and QR code; this can be switched on when needed. Confirm the rules with a tax advisor. |

## 17. Data model

These are the main tables; every money or stock change is a row in a transaction table, never an overwrite.

| Table | Key columns | Purpose |
| --- | --- | --- |
| items | id, code, name, isbn, brand\_id, category\_id, base\_price, cost\_price, base\_unit, min\_stock, status | Books and stationery |
| item\_barcodes | item\_id, barcode | All barcodes per item |
| item\_units | item\_id, unit\_name, factor | Box, dozen, carton conversions |
| brands | id, name, type (publisher / manufacturer) | Brands |
| categories | id, name, parent\_id | Category tree |
| book\_sets | id, name, school, class; set\_items: set\_id, item\_id, qty | School book sets |
| clients | id, name, phone, address, type, credit\_limit, terms\_days, opening\_balance | Customers |
| client\_brand\_discounts | client\_id, brand\_id, discount\_pct | Brand discount per client |
| client\_item\_discounts | client\_id, item\_id, special\_price, discount\_pct | Book discount per client |
| suppliers | id, name, phone, address, terms\_days, opening\_balance | Suppliers |
| sales / sale\_lines | bill\_no, date, client\_id, user\_id, type, totals, status; item\_id, qty, unit, base\_price, discount\_pct, discount\_source, line\_total | Retail and wholesale bills |
| quotations / sales\_orders | same shape as sales | Quotes and orders |
| purchases / purchase\_lines | supplier\_id, supplier\_invoice\_no, date, charges, status; item\_id, qty, unit, rate | Purchase entries |
| returns / return\_lines | original\_bill\_no, date, refund\_method, approved\_by; item\_id, qty, price, condition, reason | Sales returns |
| stock\_movements | item\_id, location\_id, date, qty\_in, qty\_out, doc\_type, doc\_id | Every stock change |
| payments | party\_type, party\_id, date, amount, mode, cheque details, against\_doc | Money in and out |
| ledger\_entries | party\_type, party\_id, date, debit, credit, doc\_type, doc\_id | Client and supplier ledgers |
| expenses | date, head, amount, mode, note | Shop expenses |
| credit\_notes | number, client\_id, amount, balance | Store credit |
| users / roles / permissions | — | Access control |
| audit\_log | user\_id, time, table, record\_id, old\_value, new\_value | Change history |
| item\_batches | id, item\_id, price, barcode, received\_date, qty\_on\_hand | Price batches (PM-12); stock\_movements and sale\_lines carry batch\_id |
| stock\_reservations | item\_id, batch\_id, qty, doc\_type, doc\_id, status | Reserved stock (ST-11) |
| supplier\_brand\_discounts | supplier\_id, brand\_id, item\_id (nullable), discount\_pct | Purchase discounts (PU-11) |
| demand\_requests | id, item\_id or title, qty, customer, phone, advance, status, date | Demand and pre-orders (DO-01 to DO-05) |
| shifts | id, user\_id, device\_id, opened\_at, opening\_cash, closed\_at, counted\_cash, difference | Cashier shifts (LA-13) |
| devices | id, name, bill\_prefix, next\_number | Per-device bill numbers (NF-15) |

## 18. Delivery phases

Phase 1 gives a working shop on day one; later phases add control and convenience without changing the core.

| Phase | Goal | Requirements included |
| --- | --- | --- |
| 1. Core billing | Bill, buy and track stock and balances | US-01–04, PM-01–08, PR-01–09, PR-13, RS-01–12, BE-01–10, WS-01–07, PU-01–05, PU-09–10, ST-01–05, ST-09–10, LA-01–04, LA-09–11, BC-01–05, BC-07, RP-01–03, RP-07, RP-09, RP-12–13, SE-01–04, SE-06–07, NF-01, NF-03–05, NF-07–08, NF-11–14, CU-01–04, CU-07, CU-10–13, PM-12, PR-14–15, BE-11–12, PU-11, ST-11, ST-13, LA-13, RP-20, NF-15, CU-21 (if required) |
| 2. Control and returns | Returns, discount tools, audits and full reports | RT-01–10, PR-10–12, PM-09–11, WS-08, ST-06–07, LA-05–07, LA-12, RP-04–06, RP-08, RP-10–11, RP-14–15, RP-17, SE-05, SE-08, NF-02, NF-09, CU-05–06, CU-08–09, CU-14–19, RS-13, DO-01–05, PM-13–14, WS-12, RT-11, PU-12, ST-12, LA-14–15, RP-18–19, SE-09–10 |
| 3. Growth | Orders, consignment, sets, sharing, more counters and locations | WS-09–11, PU-06–08, ST-08, LA-08, BC-06, RP-16, NF-06, NF-10, CU-20 |

## 19. Project delivery

The system is accepted only when each requirement passes its test, the shop's data is moved in, and staff are trained.

| ID | Requirement | Details |
| --- | --- | --- |
| PD-01 | Acceptance criteria | Each requirement ID gets a written test (what to do and what should happen). The owner signs off each phase only when all its tests pass on the shop's own hardware. |
| PD-02 | Trial run | Before go-live, run the new system alongside the current method for at least one week and compare daily totals. |
| PD-03 | Data migration plan | Before go-live: import items with codes and prices, clients and suppliers with opening balances, client and supplier discounts, and opening stock counted on go-live day. Totals are checked against the old records. |
| PD-04 | Go-live timing | Go live outside the busy admission season. |
| PD-05 | Training | Hands-on training for each role (cashier, manager, accountant, owner) and a short user guide with screenshots, in English and Urdu. |
| PD-06 | Support and maintenance | Agree in writing who fixes problems, response times (e.g., same day for billing down, 3 days for minor issues), the monthly support fee, and who pays hosting. |
| PD-07 | Ownership of data and code | The shop owns its data and can export all of it at any time; agree who owns the source code. |
| PD-08 | Updates | New versions are tested before release and installed outside shop hours, with a way to roll back. |

## 20. Open questions

- [ ] Do wholesale clients get their discount on the same base price as retail (the printed price), or on a separate wholesale price per item?
- [ ] Where is the web app hosted: on a cloud server (reachable from anywhere, needs internet at the counter or an offline mode), or on a computer in the shop (billing works without internet, outside access needs extra setup)?
- [ ] One shop only, or are branches planned?
- [ ] Is sales tax charged on any items, and are tax invoices needed?
- [ ] Should a book-level discount always win over the brand discount, even when it is lower?
- [ ] Are books ever bought on consignment today, and from which suppliers?
- [ ] How many counters bill at the same time in peak season?
- [x] Who will build it: decided, the owner using Claude Code.
