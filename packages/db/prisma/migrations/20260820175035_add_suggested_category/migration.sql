-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN     "suggestedCategoryId" TEXT;

-- CreateIndex
CREATE INDEX "Transaction_suggestedCategoryId_idx" ON "Transaction"("suggestedCategoryId");

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_suggestedCategoryId_fkey" FOREIGN KEY ("suggestedCategoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;
