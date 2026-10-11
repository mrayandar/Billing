-- Step 4: clients and their price rules

-- OS-07: a bill line can take its discount from the last sale to the client.
ALTER TYPE "DiscountSource" ADD VALUE 'LAST_SALE';

-- Company discounts: switched off instead of deleted, and the bill they were saved from.
ALTER TABLE "client_company_discounts" ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "client_company_discounts" ADD COLUMN "sourceBillNo" TEXT;

-- Book rules: who set it, when, from which bill; switched off instead of deleted.
ALTER TABLE "client_item_rules" RENAME COLUMN "updatedById" TO "setById";
ALTER TABLE "client_item_rules" RENAME COLUMN "updatedAt" TO "setAt";
ALTER TABLE "client_item_rules" ALTER COLUMN "setAt" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "client_item_rules" RENAME COLUMN "setFrom" TO "sourceBillNo";
-- The sample rows held a person's name or "Bill C1-0987"; keep only real bill numbers.
UPDATE "client_item_rules" SET "sourceBillNo" = CASE WHEN "sourceBillNo" LIKE 'Bill %' THEN substr("sourceBillNo", 6) ELSE NULL END;
ALTER TABLE "client_item_rules" ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true;

-- Client codes work like item codes: letters and numbers, up to 12, not case-sensitive.
-- The sample clients "CL-0001" and "CL-0412" become plain numbers "1" and "412".
UPDATE "clients" SET "code" = COALESCE(NULLIF(regexp_replace("code", '^CL-0*', ''), ''), '0') WHERE "code" LIKE 'CL-%';
ALTER TABLE "clients" ADD COLUMN "codeKey" TEXT;
UPDATE "clients" SET "codeKey" = lower("code");
ALTER TABLE "clients" ALTER COLUMN "codeKey" SET NOT NULL;
CREATE UNIQUE INDEX "clients_codeKey_key" ON "clients"("codeKey");
