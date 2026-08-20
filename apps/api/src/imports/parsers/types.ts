import { PaymentMethod, TransactionType } from '@gotardo/db';

export type ParsedTransaction = {
  date: string;
  description: string;
  amount: string;
  type: TransactionType;
  externalId?: string;
  paymentMethod?: PaymentMethod | null;
};

export function typeFromAmount(amount: string): TransactionType {
  if (amount.trim().startsWith('-')) {
    return TransactionType.EXPENSE;
  }
  return TransactionType.INCOME;
}

export function normalizeDescription(value: string): string {
  return value.toLowerCase().trim().replace(/\s+/g, ' ');
}
