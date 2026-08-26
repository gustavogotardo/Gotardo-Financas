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

/**
 * Data de hoje no calendário local (YYYY-MM-DD), não em UTC. `toISODate` usa
 * o dia em UTC, que já é o dia seguinte à noite em fusos negativos (ex.:
 * BRT/UTC-3) — usar isso para pré-preencher um campo de data adianta o dia
 * por engano.
 */
export function todayLocalISODate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
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

const GOAL_STATUS_LABELS: Record<string, string> = {
  ACTIVE: 'Ativa',
  PAUSED: 'Pausada',
  COMPLETED: 'Concluída',
  CANCELLED: 'Cancelada',
};

export function goalStatusLabel(status: string): string {
  return GOAL_STATUS_LABELS[status] ?? status;
}

const GOAL_STRATEGY_LABELS: Record<string, string> = {
  FIXED: 'Valor fixo',
  PERCENTAGE: 'Percentual da renda',
  PROPORTIONAL: 'Proporcional entre metas',
  OPPORTUNISTIC: 'Quando sobrar',
};

export function goalStrategyLabel(strategy: string): string {
  return GOAL_STRATEGY_LABELS[strategy] ?? strategy;
}

const DEBT_STATUS_LABELS: Record<string, string> = {
  ACTIVE: 'Ativa',
  PAID_OFF: 'Quitada',
  CANCELLED: 'Cancelada',
};

export function debtStatusLabel(status: string): string {
  return DEBT_STATUS_LABELS[status] ?? status;
}

const NOTIFICATION_TYPE_LABELS: Record<string, string> = {
  BUDGET_EXCEEDED: 'Orçamento estourado',
  ANOMALY_DETECTED: 'Despesa fora do padrão',
  GOAL_AT_RISK: 'Meta em risco',
  DUPLICATE_DETECTED: 'Possível duplicata',
  DOCUMENT_PENDING: 'Importação pendente',
  ACCOUNT_DUE: 'Fatura vencendo',
  RECURRING_GENERATED: 'Recorrência gerada',
};

export function notificationTypeLabel(type: string): string {
  return NOTIFICATION_TYPE_LABELS[type] ?? type;
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
