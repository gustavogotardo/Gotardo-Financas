export const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? '';

export type AuthTokens = { accessToken: string; refreshToken: string };

export type MeResponse = {
  id: string;
  email: string;
  name: string;
  role: string;
  familyId: string;
  createdAt: string;
  family: { id: string; name: string; currency: string; createdAt: string };
};

export type AccountRecord = {
  id: string;
  name: string;
  type: string;
  institution: string | null;
  currency: string;
  balance: string;
  creditLimit: string | null;
  billingDay: number | null;
  dueDay: number | null;
  isArchived: boolean;
  createdAt: string;
};

export type InvoiceTransaction = {
  id: string;
  description: string;
  amount: string;
  type: string;
  status: string;
  date: string;
  installmentNumber: number | null;
  installmentTotal: number | null;
  installmentGroupId: string | null;
  categoryId: string | null;
};

export type AccountInvoice = {
  accountId: string;
  period: string;
  closingDate: string;
  dueDate: string;
  transactions: InvoiceTransaction[];
  total: string;
};

export type CashflowMonth = { month: string; income: string; expense: string; net: string };

export type CashflowResponse = {
  from: string | null;
  to: string | null;
  income: string;
  expense: string;
  net: string;
  byMonth: CashflowMonth[];
};

export type TransactionRecord = {
  id: string;
  date: string;
  description: string;
  amount: string;
  type: string;
  status: string;
  paymentMethod: string | null;
  account: { id: string; name: string } | null;
  category: { id: string; name: string; parentId: string | null } | null;
  suggestedCategory: { id: string; name: string } | null;
  createdAt: string;
};

export type CategoryRecord = {
  id: string;
  name: string;
  parentId: string | null;
  icon: string | null;
  isEssential: boolean;
  isFixed: boolean;
};

export type PaymentMethodRow = {
  method: string | null;
  label: string;
  income: string;
  expense: string;
  count: number;
};

export type CategoryExpenseRow = {
  categoryId: string | null;
  categoryName: string;
  total: string;
};

export type EnvelopeExpenseRow = {
  envelopeId: string | null;
  envelopeName: string;
  total: string;
};

export type AccountStatementTransaction = {
  id: string;
  date: string;
  description: string;
  amount: string;
  type: string;
  status: string;
  category: { id: string; name: string } | null;
};

export type AccountStatement = {
  account: { id: string; name: string; currency: string };
  from: string | null;
  to: string | null;
  openingBalance: string;
  closingBalance: string;
  income: string;
  expense: string;
  transactions: AccountStatementTransaction[];
};

export type AnomalyRow = {
  transactionId: string;
  isAnomaly: boolean;
  reason: string | null;
};

export type CreateTransactionInput = {
  description: string;
  amount: number;
  type: string;
  status: string;
  accountId: string;
  categoryId?: string;
  incomeSourceId?: string;
  paymentMethod?: string;
  date: string;
  installments?: number;
};

export type CreateAccountInput = {
  name: string;
  type?: string;
  institution?: string;
  creditLimit?: number;
  billingDay?: number;
  dueDay?: number;
};

export type CreateCategoryInput = {
  name: string;
  icon?: string;
  parentId?: string;
  isEssential?: boolean;
  isFixed?: boolean;
};

export type IncomeSourceRecord = {
  id: string;
  familyId: string;
  name: string;
  description: string | null;
  expectedAmount: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type CreateIncomeSourceInput = {
  name: string;
  description?: string;
  expectedAmount?: number;
  isActive?: boolean;
};

export type EnvelopeRecord = {
  id: string;
  name: string;
  icon: string | null;
  color: string | null;
  targetAmount: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  allocated: string;
  spent: string;
  balance: string;
};

export type CreateEnvelopeInput = {
  name: string;
  icon?: string;
  targetAmount?: number;
};

export type EnvelopeAllocationRecord = {
  id: string;
  amount: string;
  date: string;
  note: string | null;
  createdAt: string;
};

export type CreateAllocationInput = {
  amount: number;
  date?: string;
  note?: string;
};

export type GoalRecord = {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
  targetAmount: string;
  deadline: string | null;
  priority: number;
  status: string;
  monthlyContribution: string | null;
  strategy: string | null;
  createdAt: string;
  updatedAt: string;
  currentAmount: string;
  progress: string;
  monthlyRequired: string | null;
  predictedCompletionDate: string | null;
  isAtRisk: boolean;
};

export type CreateGoalInput = {
  name: string;
  description?: string;
  icon?: string;
  targetAmount: number;
  deadline?: string;
  priority?: 1 | 2 | 3;
  strategy?: string;
  monthlyContribution?: number;
  status?: string;
};

export type GoalAllocationRecord = {
  id: string;
  amount: string;
  date: string;
  note: string | null;
  source: string;
  createdAt: string;
};

export type CreateGoalAllocationInput = {
  amount: number;
  date?: string;
  note?: string;
  source?: string;
};

export type DebtRecord = {
  id: string;
  name: string;
  creditor: string | null;
  totalAmount: string;
  interestRate: string | null;
  installmentAmount: string | null;
  dueDay: number | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  paidAmount: string;
  remainingAmount: string;
};

export type CreateDebtInput = {
  name: string;
  creditor?: string;
  totalAmount: number;
  interestRate?: number;
  installmentAmount?: number;
  dueDay?: number;
  status?: string;
};

export type DebtPaymentRecord = {
  id: string;
  amount: string;
  date: string;
  note: string | null;
  createdAt: string;
};

export type CreateDebtPaymentInput = {
  amount: number;
  date?: string;
  note?: string;
};

export type ImportRecord = {
  id: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  status: string;
  errorMessage: string | null;
  createdAt: string;
  transactionCount: number;
};

export type FamilyMember = {
  id: string;
  email: string;
  name: string;
  role: string;
  createdAt: string;
};

export type FamilyInvitation = {
  id: string;
  email: string;
  role: string;
  expiresAt: string;
  createdAt: string;
};

export type FamilyResponse = {
  id: string;
  name: string;
  currency: string;
  createdAt: string;
  users: FamilyMember[];
  invitations: FamilyInvitation[];
};

export type CreateInvitationInput = {
  email: string;
  role?: string;
};

export type NotificationRecord = {
  id: string;
  familyId: string;
  userId: string;
  type: string;
  title: string;
  message: string;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  isRead: boolean;
  actionUrl: string | null;
  metadata: unknown;
  dedupeKey: string;
  createdAt: string;
  readAt: string | null;
};

export type NotificationPreferences = {
  mutedNotificationTypes: string[];
};

export type HealthIndicator = {
  value: string;
  status: 'good' | 'warning' | 'critical';
  trend: 'up' | 'down' | 'stable' | null;
};

export type HealthIndicatorsResponse = {
  savingsRate: HealthIndicator;
  emergencyReserve: HealthIndicator;
  commitment: HealthIndicator;
  essentialRatio: HealthIndicator;
  fixedRatio: HealthIndicator;
  incomeDiversification: HealthIndicator;
  debtToIncomeRatio: HealthIndicator;
};

export type ProjectionMonth = {
  month: string;
  income: string;
  expense: string;
  savingsCapacity: string;
  balance: string;
};

export type ProjectionResponse = {
  scenario: 'CONSERVATIVE' | 'BASE' | 'OPTIMISTIC' | 'CUSTOM';
  startingBalance: string;
  goalMonthlyContribution: string;
  debtInstallmentTotal: string;
  months: ProjectionMonth[];
};

export function getAccountInvoice(accountId: string, period?: string): Promise<AccountInvoice> {
  return apiFetch<AccountInvoice>(
    `/api/v1/accounts/${accountId}/invoice${period ? `?period=${period}` : ''}`,
  );
}

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const TOKENS_KEY = 'gotardo.tokens';

export function getTokens(): AuthTokens | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(TOKENS_KEY);
    return raw ? (JSON.parse(raw) as AuthTokens) : null;
  } catch {
    return null;
  }
}

export function setTokens(tokens: AuthTokens | null): void {
  if (typeof window === 'undefined') return;
  if (tokens) window.localStorage.setItem(TOKENS_KEY, JSON.stringify(tokens));
  else window.localStorage.removeItem(TOKENS_KEY);
}

let refreshPromise: Promise<AuthTokens> | null = null;

function dispatchSessionExpired(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event('gotardo:session-expired'));
}

const REFRESH_LOCK_KEY = 'gotardo.refresh-lock';
const REFRESH_LOCK_TTL_MS = 8000;

function tryAcquireRefreshLock(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    const now = Date.now();
    const raw = window.localStorage.getItem(REFRESH_LOCK_KEY);
    if (raw) {
      const holder = JSON.parse(raw) as { takenAt: number };
      if (now - holder.takenAt < REFRESH_LOCK_TTL_MS) return false;
    }
    window.localStorage.setItem(REFRESH_LOCK_KEY, JSON.stringify({ takenAt: now }));
    return true;
  } catch {
    return true;
  }
}

function releaseRefreshLock(): void {
  try {
    window.localStorage.removeItem(REFRESH_LOCK_KEY);
  } catch {
    // localStorage indisponível: nada a liberar
  }
}

function waitForRotatedTokens(previous: AuthTokens): Promise<AuthTokens> {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const check = () => {
      const tokens = getTokens();
      if (tokens && tokens.refreshToken !== previous.refreshToken) {
        resolve(tokens);
      } else if (Date.now() - started > REFRESH_LOCK_TTL_MS) {
        reject(new ApiError(401, 'Sessão expirada. Faça login novamente.'));
      } else {
        setTimeout(check, 120);
      }
    };
    check();
  });
}

async function refreshTokens(): Promise<AuthTokens> {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    const current = getTokens();
    if (!current?.refreshToken) {
      throw new ApiError(401, 'Sessão expirada. Faça login novamente.');
    }
    if (!tryAcquireRefreshLock()) {
      return waitForRotatedTokens(current);
    }
    try {
      const res = await fetch(`${API_BASE}/api/v1/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: current.refreshToken }),
      });
      if (!res.ok) {
        const tokens = getTokens();
        if (tokens && tokens.refreshToken !== current.refreshToken) {
          return tokens;
        }
        setTokens(null);
        dispatchSessionExpired();
        throw new ApiError(401, 'Sessão expirada. Faça login novamente.');
      }
      const tokens = (await res.json()) as AuthTokens;
      setTokens(tokens);
      return tokens;
    } finally {
      releaseRefreshLock();
    }
  })().finally(() => {
    refreshPromise = null;
  });

  return refreshPromise;
}

export async function apiFetch<T>(
  path: string,
  init: RequestInit = {},
  allowRetry = true,
): Promise<T> {
  const tokens = getTokens();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init.headers as Record<string, string> | undefined),
  };
  if (tokens?.accessToken) {
    headers.Authorization = `Bearer ${tokens.accessToken}`;
  }

  const res = await fetch(`${API_BASE}${path}`, { ...init, headers });

  if (res.status === 401 && allowRetry && tokens?.refreshToken) {
    await refreshTokens();
    return apiFetch<T>(path, init, false);
  }

  if (!res.ok) {
    let message = `Erro ${res.status}`;
    try {
      const body = (await res.json()) as { message?: string | string[] };
      if (Array.isArray(body.message)) message = body.message.join('. ');
      else if (body.message) message = body.message;
    } catch {
      // corpo sem JSON
    }
    throw new ApiError(res.status, message);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export async function apiUpload<T>(
  path: string,
  formData: FormData,
  allowRetry = true,
): Promise<T> {
  const tokens = getTokens();
  const headers: Record<string, string> = {};
  if (tokens?.accessToken) {
    headers.Authorization = `Bearer ${tokens.accessToken}`;
  }

  const res = await fetch(`${API_BASE}${path}`, { method: 'POST', headers, body: formData });

  if (res.status === 401 && allowRetry && tokens?.refreshToken) {
    await refreshTokens();
    return apiUpload<T>(path, formData, false);
  }

  if (!res.ok) {
    let message = `Erro ${res.status}`;
    try {
      const body = (await res.json()) as { message?: string | string[] };
      if (Array.isArray(body.message)) message = body.message.join('. ');
      else if (body.message) message = body.message;
    } catch {
      // corpo sem JSON
    }
    throw new ApiError(res.status, message);
  }

  return (await res.json()) as T;
}
