-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('PIX', 'BOLETO', 'CREDIT_CARD', 'DEBIT_CARD', 'TRANSFER', 'CASH', 'OTHER');

-- AlterTable: converte a coluna mantendo os dados (backfill dos valores livres).
-- Valores não reconhecidos viram NULL (sem método).
ALTER TABLE "Transaction" ALTER COLUMN "paymentMethod" TYPE "PaymentMethod" USING (
  CASE lower(trim("paymentMethod"))
    WHEN 'pix' THEN 'PIX'
    WHEN 'pix instantaneo' THEN 'PIX'
    WHEN 'boleto' THEN 'BOLETO'
    WHEN 'cartao de credito' THEN 'CREDIT_CARD'
    WHEN 'credito' THEN 'CREDIT_CARD'
    WHEN 'cartao de debito' THEN 'DEBIT_CARD'
    WHEN 'debito' THEN 'DEBIT_CARD'
    WHEN 'transferencia' THEN 'TRANSFER'
    WHEN 'transfer' THEN 'TRANSFER'
    WHEN 'dinheiro' THEN 'CASH'
    WHEN 'cash' THEN 'CASH'
    ELSE NULL
  END
)::"PaymentMethod";