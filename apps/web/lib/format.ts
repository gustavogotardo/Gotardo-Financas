const brlFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

export function brl(value: string | number): string {
  return brlFormatter.format(Number(value));
}

export function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('pt-BR');
}

export function monthRange(reference = new Date()): { from: string; to: string } {
  const year = reference.getFullYear();
  const month = reference.getMonth();
  const from = new Date(year, month, 1);
  const to = new Date(year, month + 1, 0);
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  };
}

const ACCOUNT_TYPE_LABELS: Record<string, string> = {
  CHECKING: 'Conta corrente',
  SAVINGS: 'Poupança',
  INVESTMENT: 'Investimento',
  CASH: 'Dinheiro',
};

export function accountTypeLabel(type: string): string {
  return ACCOUNT_TYPE_LABELS[type] ?? type;
}

const TRANSACTION_TYPE_LABELS: Record<string, string> = {
  INCOME: 'Receita',
  EXPENSE: 'Despesa',
  TRANSFER: 'Transferência',
};

export function transactionTypeLabel(type: string): string {
  return TRANSACTION_TYPE_LABELS[type] ?? type;
}

const STATUS_LABELS: Record<string, string> = {
  PENDING: 'Pendente',
  CONFIRMED: 'Confirmada',
  REJECTED: 'Rejeitada',
  REVIEW: 'Revisão',
};

export function statusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status;
}
