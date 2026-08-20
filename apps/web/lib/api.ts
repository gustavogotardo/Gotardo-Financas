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
  isArchived: boolean;
  createdAt: string;
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
  createdAt: string;
};

export type CategoryRecord = {
  id: string;
  name: string;
  parentId: string | null;
  icon: string | null;
};

export type PaymentMethodRow = {
  method: string | null;
  label: string;
  income: string;
  expense: string;
  count: number;
};

export type CreateTransactionInput = {
  description: string;
  amount: number;
  type: string;
  status: string;
  accountId: string;
  categoryId?: string;
  paymentMethod?: string;
  date: string;
};

export type CreateAccountInput = {
  name: string;
  type?: string;
  institution?: string;
};

export type CreateCategoryInput = {
  name: string;
  icon?: string;
  parentId?: string;
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

async function refreshTokens(): Promise<AuthTokens> {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    const current = getTokens();
    if (!current?.refreshToken) {
      throw new ApiError(401, 'Sessão expirada. Faça login novamente.');
    }
    const res = await fetch(`${API_BASE}/api/v1/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: current.refreshToken }),
    });
    if (!res.ok) {
      setTokens(null);
      dispatchSessionExpired();
      throw new ApiError(401, 'Sessão expirada. Faça login novamente.');
    }
    const tokens = (await res.json()) as AuthTokens;
    setTokens(tokens);
    return tokens;
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
