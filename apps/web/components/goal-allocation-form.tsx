'use client';

import { useState, type FormEvent } from 'react';
import { apiFetch, type CreateGoalAllocationInput, type GoalRecord } from '@/lib/api';
import { Button, Card, ErrorBox, Field, Input } from './ui';

type Props = {
  goal: GoalRecord;
  onDone: () => Promise<void>;
  onCancel: () => void;
};

export function GoalAllocationForm({ goal, onDone, onCancel }: Props) {
  const [form, setForm] = useState<CreateGoalAllocationInput>({
    amount: 0,
    date: new Date().toISOString().slice(0, 10),
    note: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await apiFetch(`/api/v1/goals/${goal.id}/allocations`, {
        method: 'POST',
        body: JSON.stringify({
          amount: form.amount,
          date: `${form.date}T12:00:00.000Z`,
          ...(form.note ? { note: form.note } : {}),
        }),
      });
      await onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao alocar o valor.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card className="form-card">
      <h3 className="form-title">Alocar em {goal.name}</h3>
      <form onSubmit={onSubmit}>
        <div className="form-grid">
          <Field label="Valor (R$)">
            <Input
              type="number"
              step="0.01"
              min="0.01"
              value={form.amount || ''}
              onChange={(e) => setForm((prev) => ({ ...prev, amount: Number(e.target.value) }))}
              required
            />
          </Field>
          <Field label="Data">
            <Input
              type="date"
              value={form.date}
              onChange={(e) => setForm((prev) => ({ ...prev, date: e.target.value }))}
              required
            />
          </Field>
          <Field label="Nota">
            <Input
              value={form.note}
              onChange={(e) => setForm((prev) => ({ ...prev, note: e.target.value }))}
              maxLength={200}
            />
          </Field>
        </div>
        {error ? <ErrorBox>{error}</ErrorBox> : null}
        <div className="form-actions">
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancelar
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? 'Alocando…' : 'Alocar'}
          </Button>
        </div>
      </form>
    </Card>
  );
}
