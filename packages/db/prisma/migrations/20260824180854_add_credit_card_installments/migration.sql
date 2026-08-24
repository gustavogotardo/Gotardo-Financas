-- AlterEnum
ALTER TYPE "AccountType" ADD VALUE 'CREDIT_CARD';

-- AlterTable
ALTER TABLE "Account" ADD COLUMN     "billingDay" INTEGER,
ADD COLUMN     "creditLimit" DECIMAL(12,2),
ADD COLUMN     "dueDay" INTEGER;

-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN     "installmentGroupId" TEXT,
ADD COLUMN     "installmentNumber" INTEGER,
ADD COLUMN     "installmentTotal" INTEGER;

-- CreateIndex
CREATE INDEX "Transaction_installmentGroupId_idx" ON "Transaction"("installmentGroupId");
