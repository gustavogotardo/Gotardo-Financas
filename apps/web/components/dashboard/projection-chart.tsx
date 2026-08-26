'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { apiFetch, type ProjectionResponse } from '@/lib/api';
import { brl } from '@/lib/format';
import { Card, ErrorBox, Select, Spinner, StatCard } from '@/components/ui';

const SCENARIO_OPTIONS = [
  { value: 'CONSERVATIVE', label: 'Conservador' },
  { value: 'BASE', label: 'Base' },
  { value: 'OPTIMISTIC', label: 'Otimista' },
];

const MONTHS_OPTIONS = [
  { value: 3, label: '3 meses' },
  { value: 6, label: '6 meses' },
  { value: 12, label: '12 meses' },
];

const MONTH_ABBREVIATIONS = [
  'jan',
  'fev',
  'mar',
  'abr',
  'mai',
  'jun',
  'jul',
  'ago',
  'set',
  'out',
  'nov',
  'dez',
];

/** Formats a "YYYY-MM" month key as a short pt-BR label, e.g. "2026-01" -> "jan/26". */
function monthShortLabel(month: string): string {
  const [year, monthNumber] = month.split('-');
  if (!year || !monthNumber) return month;
  const abbreviation = MONTH_ABBREVIATIONS[Number(monthNumber) - 1] ?? monthNumber;
  return `${abbreviation}/${year.slice(2)}`;
}

type ChartPoint = {
  label: string;
  balance: number;
};

export function ProjectionChart() {
  const [scenario, setScenario] = useState('BASE');
  const [months, setMonths] = useState(6);
  const [projection, setProjection] = useState<ProjectionResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    apiFetch<ProjectionResponse>(
      `/api/v1/reports/projection?scenario=${scenario}&months=${months}`,
    )
      .then((result) => {
        if (!cancelled) setProjection(result);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Falha ao carregar a projeção.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [scenario, months]);

  const chartData: ChartPoint[] = useMemo(
    () =>
      (projection?.months ?? []).map((row) => ({
        label: monthShortLabel(row.month),
        balance: Number(row.balance),
      })),
    [projection],
  );

  return (
    <section className="section">
      <div className="section-head">
        <h2>Projeção de saldo</h2>
        <div className="section-head-actions">
          <Select value={scenario} onChange={(e) => setScenario(e.target.value)}>
            {SCENARIO_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
          <Select value={months} onChange={(e) => setMonths(Number(e.target.value))}>
            {MONTHS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </div>
      </div>
      <Card>
        {error ? <ErrorBox>{error}</ErrorBox> : null}
        {loading ? (
          <Spinner />
        ) : !projection || chartData.length === 0 ? (
          <p className="empty">Sem dados suficientes para projetar o saldo.</p>
        ) : (
          <>
            <div className="stat-grid">
              <StatCard label="Saldo inicial" value={brl(projection.startingBalance)} />
              <StatCard
                label="Aportes de metas/mês"
                value={brl(projection.goalMonthlyContribution)}
                tone="warning"
              />
              <StatCard
                label="Parcelas de dívidas/mês"
                value={brl(projection.debtInstallmentTotal)}
                tone="danger"
              />
            </div>
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
                  <Tooltip formatter={(value) => [brl(Number(value ?? 0)), 'Saldo projetado']} />
                  <Line
                    type="monotone"
                    dataKey="balance"
                    name="Saldo projetado"
                    stroke="#2563eb"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </>
        )}
      </Card>
    </section>
  );
}
