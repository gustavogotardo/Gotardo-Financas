'use client';

import { useState, type FormEvent } from 'react';
import { apiFetch, type CreateGoalInput, type GoalRecord } from '@/lib/api';
import { goalStatusLabel, goalStrategyLabel } from '@/lib/format';
import { Button, Card, ErrorBox, Field, Input, Select } from './ui';

type Props = {
  goal?: GoalRecord;
  onDone: () => Promise<void>;
  onCancel: () => void;
};

const PRIORITIES = [
  { value: 1, label: 'Alta' },
  { value: 2, label: 'Média' },
  { value: 3, label: 'Baixa' },
];

const STRATEGIES = ['FIXED', 'PERCENTAGE', 'PROPORTIONAL', 'OPPORTUNISTIC'];
const STATUSES = ['ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED'];

export function GoalForm({ goal, onDone, onCancel }: Props) {
  const isEdit = Boolean(goal);
  const [form, setForm] = useState<CreateGoalInput>({
    name: goal?.name ?? '',
    description: goal?.description ?? '',
    icon: goal?.icon ?? '',
    targetAmount: goal ? Number(goal.targetAmount) : 0,
    deadline: goal?.deadline ? goal.deadline.slice(0, 10) : '',
    priority: (goal?.priority as 1 | 2 | 3 | undefined) ?? 2,
    strategy: goal?.strategy ?? '',
    monthlyContribution: goal?.monthlyContribution ? Number(goal.monthlyContribution) : undefined,
  });
  const [status, setStatus] = useState(goal?.status ?? 'ACTIVE');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const goalId = goal?.id ?? '';
      const payload: Record<string, unknown> = {
        name: form.name,
        targetAmount: form.targetAmount,
        priority: form.priority,
      };
      if (form.description) payload.description = form.description;
      else if (isEdit) payload.description = null;
      if (form.icon) payload.icon = form.icon;
      else if (isEdit) payload.icon = null;
      if (form.deadline) payload.deadline = `${form.deadline}T12:00:00.000Z`;
      else if (isEdit) payload.deadline = null;
      if (form.strategy) payload.strategy = form.strategy;
      else if (isEdit) payload.strategy = null;
      if (form.monthlyContribution !== undefined && form.monthlyContribution > 0) {
        payload.monthlyContribution = form.monthlyContribution;
      } else if (isEdit) {
        payload.monthlyContribution = null;
      }
      if (isEdit) payload.status = status;

      await apiFetch(isEdit ? `/api/v1/goals/${goalId}` : '/api/v1/goals', {
        method: isEdit ? 'PATCH' : 'POST',
        body: JSON.stringify(payload),
      });
      await onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao salvar a meta.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!goal) return;
    if (!window.confirm(`Excluir a meta "${goal.name}"?`)) return;
    setDeleting(true);
    setError(null);
    try {
      await apiFetch(`/api/v1/goals/${goal.id}`, { method: 'DELETE' });
      await onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao excluir a meta.');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Card className="form-card">
      <h3 className="form-title">{isEdit ? 'Editar meta' : 'Nova meta'}</h3>
      <form onSubmit={onSubmit}>
        <div className="form-grid">
          <Field label="Nome">
            <Input
              value={form.name}
              onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
              maxLength={100}
              required
            />
          </Field>
          <Field label="Ícone" hint="Emoji ou texto curto.">
            <Input
              value={form.icon}
              onChange={(e) => setForm((prev) => ({ ...prev, icon: e.target.value }))}
              maxLength={50}
            />
          </Field>
          <Field label="Valor-alvo (R$)">
            <Input
              type="number"
              step="0.01"
              min="0.01"
              value={form.targetAmount || ''}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, targetAmount: Number(e.target.value) }))
              }
              required
            />
          </Field>
          <Field label="Prazo" hint="Opcional.">
            <Input
              type="date"
              value={form.deadline}
              onChange={(e) => setForm((prev) => ({ ...prev, deadline: e.target.value }))}
            />
          </Field>
          <Field label="Prioridade">
            <Select
              value={form.priority}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, priority: Number(e.target.value) as 1 | 2 | 3 }))
              }
            >
              {PRIORITIES.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Estratégia" hint="Opcional.">
            <Select
              value={form.strategy}
              onChange={(e) => setForm((prev) => ({ ...prev, strategy: e.target.value }))}
            >
              <option value="">Sem estratégia definida</option>
              {STRATEGIES.map((s) => (
                <option key={s} value={s}>
                  {goalStrategyLabel(s)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Contribuição mensal (R$)" hint="Opcional.">
            <Input
              type="number"
              step="0.01"
              min="0.01"
              value={form.monthlyContribution ?? ''}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  monthlyContribution: e.target.value ? Number(e.target.value) : undefined,
                }))
              }
            />
          </Field>
          {isEdit ? (
            <Field label="Status">
              <Select value={status} onChange={(e) => setStatus(e.target.value)}>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {goalStatusLabel(s)}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}
          <Field label="Descrição" hint="Opcional.">
            <Input
              value={form.description}
              onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
              maxLength={500}
            />
          </Field>
        </div>
        {error ? <ErrorBox>{error}</ErrorBox> : null}
        <div className="form-actions">
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancelar
          </Button>
          {isEdit ? (
            <Button
              type="button"
              variant="ghost"
              onClick={() => void handleDelete()}
              disabled={deleting}
            >
              {deleting ? 'Excluindo…' : 'Excluir meta'}
            </Button>
          ) : null}
          <Button type="submit" disabled={submitting}>
            {submitting ? 'Salvando…' : isEdit ? 'Salvar' : 'Criar meta'}
          </Button>
        </div>
      </form>
    </Card>
  );
}
