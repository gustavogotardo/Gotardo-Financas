'use client';

import { useEffect, useState } from 'react';
import { apiFetch, type HealthIndicator, type HealthIndicatorsResponse } from '@/lib/api';
import { Card, ErrorBox, Spinner, StatCard } from '@/components/ui';

const STATUS_TONE: Record<HealthIndicator['status'], 'success' | 'warning' | 'danger'> = {
  good: 'success',
  warning: 'warning',
  critical: 'danger',
};

const TREND_ARROW: Record<NonNullable<HealthIndicator['trend']>, string> = {
  up: '↑',
  down: '↓',
  stable: '→',
};

function formatIndicatorValue(indicator: HealthIndicator, suffix: string): string {
  return `${indicator.value}${suffix}`;
}

type Props = {
  /** Bumped by the parent whenever dashboard data reloads, to trigger a refetch here too. */
  refreshToken?: number;
};

export function HealthIndicatorsSection({ refreshToken }: Props) {
  const [indicators, setIndicators] = useState<HealthIndicatorsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    apiFetch<HealthIndicatorsResponse>('/api/v1/reports/health-indicators')
      .then((result) => {
        if (!cancelled) setIndicators(result);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Falha ao carregar a saúde financeira.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [refreshToken]);

  return (
    <section className="section">
      <div className="section-head">
        <h2>Saúde financeira</h2>
      </div>
      <Card>
        {error ? <ErrorBox>{error}</ErrorBox> : null}
        {loading ? (
          <Spinner />
        ) : !indicators ? null : (
          <div className="stat-grid">
            <StatCard
              label="Taxa de poupança"
              value={
                formatIndicatorValue(indicators.savingsRate, '%') +
                (indicators.savingsRate.trend
                  ? ` ${TREND_ARROW[indicators.savingsRate.trend]}`
                  : '')
              }
              tone={STATUS_TONE[indicators.savingsRate.status]}
            />
            <StatCard
              label="Reserva de emergência"
              value={formatIndicatorValue(indicators.emergencyReserve, ' meses')}
              tone={STATUS_TONE[indicators.emergencyReserve.status]}
            />
            <StatCard
              label="Comprometimento de renda"
              value={formatIndicatorValue(indicators.commitment, '%')}
              tone={STATUS_TONE[indicators.commitment.status]}
            />
            <StatCard
              label="Gasto essencial"
              value={formatIndicatorValue(indicators.essentialRatio, '%')}
              tone={STATUS_TONE[indicators.essentialRatio.status]}
            />
            <StatCard
              label="Despesas fixas"
              value={formatIndicatorValue(indicators.fixedRatio, '%')}
              tone={STATUS_TONE[indicators.fixedRatio.status]}
            />
            <StatCard
              label="Diversificação de fontes"
              value={formatIndicatorValue(indicators.incomeDiversification, '')}
              tone={STATUS_TONE[indicators.incomeDiversification.status]}
            />
            <StatCard
              label="Dívida/renda anual"
              value={formatIndicatorValue(indicators.debtToIncomeRatio, '%')}
              tone={STATUS_TONE[indicators.debtToIncomeRatio.status]}
            />
          </div>
        )}
      </Card>
    </section>
  );
}
