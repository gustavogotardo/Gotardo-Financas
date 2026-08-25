-- CreateEnum
CREATE TYPE "GoalStatus" AS ENUM ('ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "GoalStrategy" AS ENUM ('FIXED', 'PERCENTAGE', 'PROPORTIONAL', 'OPPORTUNISTIC');

-- CreateEnum
CREATE TYPE "AllocationSource" AS ENUM ('MANUAL', 'AUTO');

-- CreateTable
CREATE TABLE "FinancialGoal" (
    "id" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "icon" TEXT,
    "targetAmount" DECIMAL(12,2) NOT NULL,
    "deadline" TIMESTAMP(3),
    "priority" INTEGER NOT NULL DEFAULT 2,
    "status" "GoalStatus" NOT NULL DEFAULT 'ACTIVE',
    "monthlyContribution" DECIMAL(12,2),
    "strategy" "GoalStrategy",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "FinancialGoal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancialGoalAllocation" (
    "id" TEXT NOT NULL,
    "goalId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "source" "AllocationSource" NOT NULL DEFAULT 'MANUAL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinancialGoalAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FinancialGoal_familyId_idx" ON "FinancialGoal"("familyId");

-- CreateIndex
CREATE INDEX "FinancialGoalAllocation_goalId_idx" ON "FinancialGoalAllocation"("goalId");

-- AddForeignKey
ALTER TABLE "FinancialGoal" ADD CONSTRAINT "FinancialGoal_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialGoalAllocation" ADD CONSTRAINT "FinancialGoalAllocation_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "FinancialGoal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
