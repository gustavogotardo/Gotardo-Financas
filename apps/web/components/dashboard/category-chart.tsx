'use client';

import { useMemo } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { CategoryExpenseRow } from '@/lib/api';
import { brl } from '@/lib/format';
import { Card } from '@/components/ui';

type Props = {
  expensesByCategory: CategoryExpenseRow[];
};

type ChartPoint = {
  key: string;
  name: string;
  total: number;
};

export function CategoryChart({ expensesByCategory }: Props) {
  const chartData: ChartPoint[] = useMemo(
    () =>
      expensesByCategory.map((row) => ({
        key: row.categoryId ?? 'none',
        name: row.categoryName,
        total: Number(row.total),
      })),
    [expensesByCategory],
  );

  const chartHeight = Math.max(220, chartData.length * 40);

  return (
    <section className="section">
      <div className="section-head">
        <h2>Gastos por categoria</h2>
      </div>
      <Card>
        {chartData.length === 0 ? (
          <p className="empty">Nenhum gasto confirmado neste mês.</p>
        ) : (
          <div style={{ width: '100%', height: chartHeight }}>
            <ResponsiveContainer>
              <BarChart
                data={chartData}
                layout="vertical"
                margin={{ top: 8, right: 24, left: 8, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis type="number" tick={{ fontSize: 12 }} tickFormatter={(value: number) => brl(value)} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 12 }} width={140} />
                <Tooltip formatter={(value) => brl(Number(value ?? 0))} />
                <Bar dataKey="total" name="Total" fill="#dc2626" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>
    </section>
  );
}
