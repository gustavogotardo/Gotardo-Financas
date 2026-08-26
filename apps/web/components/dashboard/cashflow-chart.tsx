'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { apiFetch, type CashflowResponse } from '@/lib/api';
import { brl, monthShortLabel, monthsRange } from '@/lib/format';
import { Card, ErrorBox, Select, Spinner } from '@/components/ui';

const PERIOD_OPTIONS = [
  { value: 3, label: 'Últimos 3 meses' },
  { value: 6, label: 'Últimos 6 meses' },
  { value: 12, label: 'Últimos 12 meses' },
];

type ChartPoint = {
  label: string;
  income: number;
  expense: number;
  net: number;
};

type Props = {
  /** Bumped by the parent whenever dashboard data reloads, to trigger a refetch here too. */
  refreshToken?: number;
};

export function CashflowChart({ refreshToken }: Props) {
  const [months, setMonths] = useState(6);
  const [cashflow, setCashflow] = useState<CashflowResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const { from, to } = monthsRange(months);
    apiFetch<CashflowResponse>(`/api/v1/reports/cashflow?from=${from}&to=${to}`)
      .then((result) => {
        if (!cancelled) setCashflow(result);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Falha ao carregar o fluxo de caixa.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [months, refreshToken]);

  const chartData: ChartPoint[] = useMemo(
    () =>
      (cashflow?.byMonth ?? []).map((row) => ({
        label: monthShortLabel(row.month),
        income: Number(row.income),
        expense: Number(row.expense),
        net: Number(row.net),
      })),
    [cashflow],
  );

  return (
    <section className="section">
      <div className="section-head">
        <h2>Fluxo de caixa</h2>
        <Select value={months} onChange={(e) => setMonths(Number(e.target.value))}>
          {PERIOD_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      </div>
      <Card>
        {error ? <ErrorBox>{error}</ErrorBox> : null}
        {loading ? (
          <Spinner />
        ) : chartData.length === 0 ? (
          <p className="empty">Nenhuma movimentação confirmada no período.</p>
        ) : (
          <div style={{ width: '100%', height: 280 }}>
            <ResponsiveContainer>
              <LineChart data={chartData} margin={{ top: 8, right: 16, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                <YAxis
                  tick={{ fontSize: 12 }}
                  tickFormatter={(value: number) => brl(value)}
                  width={90}
                />
                <Tooltip formatter={(value, name) => [brl(Number(value ?? 0)), String(name)]} />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="income"
                  name="Receitas"
                  stroke="#16a34a"
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="expense"
                  name="Despesas"
                  stroke="#dc2626"
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="net"
                  name="Resultado"
                  stroke="#2563eb"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>
    </section>
  );
}
