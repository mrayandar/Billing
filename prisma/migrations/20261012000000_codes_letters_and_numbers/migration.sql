-- OS-01: item codes may hold letters and numbers and are not case-sensitive.
-- codeKey is the lower-case copy that carries the uniqueness.
ALTER TABLE "items" ADD COLUMN "codeKey" TEXT;
UPDATE "items" SET "codeKey" = lower("code");
ALTER TABLE "items" ALTER COLUMN "codeKey" SET NOT NULL;
CREATE UNIQUE INDEX "items_codeKey_key" ON "items"("codeKey");

ALTER TABLE "item_codes" ADD COLUMN "codeKey" TEXT;
UPDATE "item_codes" SET "codeKey" = lower("code");
ALTER TABLE "item_codes" ALTER COLUMN "codeKey" SET NOT NULL;
CREATE UNIQUE INDEX "item_codes_codeKey_key" ON "item_codes"("codeKey");
