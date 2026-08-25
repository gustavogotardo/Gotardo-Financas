'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  apiFetch,
  type AccountRecord,
  type AccountStatement,
  type AnomalyRow,
  type CashflowResponse,
  type CategoryExpenseRow,
  type CategoryRecord,
  type EnvelopeExpenseRow,
  type EnvelopeRecord,
  type ImportRecord,
  type IncomeSourceRecord,
  type PaymentMethodRow,
  type TransactionRecord,
} from '@/lib/api';
import { monthRange } from '@/lib/format';

export type DashboardData = {
  accounts: AccountRecord[];
  categories: CategoryRecord[];
  envelopes: EnvelopeRecord[];
  incomeSources: IncomeSourceRecord[];
  imports: ImportRecord[];
  cashflow: CashflowResponse;
  paymentMethods: PaymentMethodRow[];
  expensesByCategory: CategoryExpenseRow[];
  expensesByEnvelope: EnvelopeExpenseRow[];
  accountStatement: AccountStatement | null;
  anomalies: AnomalyRow[];
  transactions: TransactionRecord[];
};

export type UseDashboardDataResult = {
  data: DashboardData | null;
  error: string | null;
  reload: () => Promise<void>;
  /** Increments on every successful load, so children can refetch their own data in sync. */
  version: number;
};

/**
 * Loads every dataset the dashboard needs for a given month/statement account.
 *
 * This is intentionally a plain `fetch`-based hook (no SWR/React Query, per project
 * convention) — it just gives the page a single, isolated boundary so a future swap to a
 * data-fetching library only touches this file.
 */
export function useDashboardData(
  month: Date,
  statementAccountId: string,
  enabled = true,
): UseDashboardDataResult {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  const load = useCallback(async () => {
    setError(null);
    const range = monthRange(month);
    try {
      const accounts = await apiFetch<AccountRecord[]>('/api/v1/accounts');
      const accountId = statementAccountId || accounts[0]?.id || '';
      const [
        categories,
        envelopes,
        incomeSources,
        imports,
        cashflow,
        paymentMethods,
        expensesByCategory,
        expensesByEnvelope,
        anomalies,
        accountStatement,
        transactions,
      ] = await Promise.all([
        apiFetch<CategoryRecord[]>('/api/v1/categories'),
        apiFetch<EnvelopeRecord[]>('/api/v1/envelopes'),
        apiFetch<IncomeSourceRecord[]>('/api/v1/income-sources'),
        apiFetch<ImportRecord[]>('/api/v1/imports'),
        apiFetch<CashflowResponse>(`/api/v1/reports/cashflow?from=${range.from}&to=${range.to}`),
        apiFetch<PaymentMethodRow[]>(
          `/api/v1/reports/payment-methods?from=${range.from}&to=${range.to}`,
        ),
        apiFetch<CategoryExpenseRow[]>(
          `/api/v1/reports/expenses-by-category?from=${range.from}&to=${range.to}`,
        ),
        apiFetch<EnvelopeExpenseRow[]>(
          `/api/v1/reports/expenses-by-envelope?from=${range.from}&to=${range.to}`,
        ),
        apiFetch<AnomalyRow[]>(`/api/v1/reports/anomalies?from=${range.from}&to=${range.to}`),
        accountId
          ? apiFetch<AccountStatement>(
              `/api/v1/reports/account-statement/${accountId}?from=${range.from}&to=${range.to}`,
            )
          : Promise.resolve(null),
        apiFetch<TransactionRecord[]>('/api/v1/transactions'),
      ]);
      setData({
        accounts,
        categories,
        envelopes,
        incomeSources,
        imports,
        cashflow,
        paymentMethods,
        expensesByCategory,
        expensesByEnvelope,
        accountStatement,
        anomalies,
        transactions,
      });
      setVersion((v) => v + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao carregar os dados.');
    }
  }, [month, statementAccountId]);

  useEffect(() => {
    if (enabled) void load();
  }, [enabled, load]);

  return { data, error, reload: load, version };
}
