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

// Transaction.amount é sempre uma magnitude positiva em todo o resto do app — o
// sinal vem exclusivamente do campo `type` (ver CreateTransactionDto/@IsPositive
// e balanceDelta() em transactions.service.ts). Bancos costumam exportar valores
// de débito já negativos (ex.: "-18,50"), então os parsers usam esse sinal só
// para inferir o type (typeFromAmount) e devem normalizar para positivo antes
// de gravar — do contrário, confirmar uma despesa importada soma ao saldo da
// conta em vez de subtrair.
export function unsignedAmount(amount: string): string {
  return amount.startsWith('-') ? amount.slice(1) : amount;
}

export function normalizeDescription(value: string): string {
  return value.toLowerCase().trim().replace(/\s+/g, ' ');
}
