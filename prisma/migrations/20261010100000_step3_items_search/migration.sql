-- Step 3: item search indexes, code history and the running item-code sequence
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- DropIndex
DROP INDEX "items_isbn_idx";

-- DropIndex
DROP INDEX "items_name_idx";

-- CreateTable
CREATE TABLE "item_codes" (
    "code" TEXT NOT NULL,
    "itemId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "item_codes_pkey" PRIMARY KEY ("code")
);

-- CreateIndex
CREATE INDEX "item_codes_itemId_idx" ON "item_codes"("itemId");

-- CreateIndex
CREATE INDEX "companies_name_idx" ON "companies" USING GIN ("name" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "items_name_idx" ON "items" USING GIN ("name" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "items_nameUrdu_idx" ON "items" USING GIN ("nameUrdu" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "items_author_idx" ON "items" USING GIN ("author" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "items_searchSpelling_idx" ON "items" USING GIN ("searchSpelling" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "items_isbn_idx" ON "items" USING GIN ("isbn" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "items_categoryId_idx" ON "items"("categoryId");


-- Item codes are plain running numbers starting at 1001 and are never handed out twice.
CREATE SEQUENCE "item_code_seq" START 1001;

-- Remember the codes the sample items already have.
INSERT INTO "item_codes" ("code", "itemId") SELECT "code", "id" FROM "items";
