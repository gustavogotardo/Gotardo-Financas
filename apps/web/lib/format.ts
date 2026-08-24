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

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function toISODate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function monthRange(reference = new Date()): { from: string; to: string } {
  const year = reference.getFullYear();
  const month = reference.getMonth();
  const from = new Date(year, month, 1);
  const to = new Date(year, month + 1, 0);
  return { from: toISODate(from), to: toISODate(to) };
}

/** Range spanning `monthsBack` full calendar months ending in the current month. */
export function monthsRange(monthsBack: number): { from: string; to: string } {
  const now = new Date();
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const from = new Date(now.getFullYear(), now.getMonth() - (monthsBack - 1), 1);
  return { from: toISODate(from), to: toISODate(to) };
}

const ACCOUNT_TYPE_LABELS: Record<string, string> = {
  CHECKING: 'Conta corrente',
  SAVINGS: 'Poupança',
  INVESTMENT: 'Investimento',
  CASH: 'Dinheiro',
  CREDIT_CARD: 'Cartão de crédito',
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

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  PIX: 'Pix',
  BOLETO: 'Boleto',
  CREDIT_CARD: 'Cartão de crédito',
  DEBIT_CARD: 'Cartão de débito',
  TRANSFER: 'Transferência',
  CASH: 'Dinheiro',
  OTHER: 'Outro',
};

export function paymentMethodLabel(method: string | null): string {
  if (!method) return 'Sem método';
  return PAYMENT_METHOD_LABELS[method] ?? method;
}

const ROLE_LABELS: Record<string, string> = {
  OWNER: 'Proprietário',
  ADMIN: 'Administrador',
  MEMBER: 'Membro',
  VIEWER: 'Leitor',
};

export function roleLabel(role: string): string {
  return ROLE_LABELS[role] ?? role;
}

export function statusTone(status: string): string {
  switch (status) {
    case 'CONFIRMED':
      return 'success';
    case 'REJECTED':
      return 'danger';
    case 'PENDING':
      return 'warning';
    default:
      return 'info';
  }
}
