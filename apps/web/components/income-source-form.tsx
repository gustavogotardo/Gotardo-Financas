'use client';

import { useState, type FormEvent } from 'react';
import { apiFetch, type CreateIncomeSourceInput, type IncomeSourceRecord } from '@/lib/api';
import { Button, Card, ErrorBox, Field, Input } from './ui';

type Props = {
  incomeSource?: IncomeSourceRecord;
  onDone: () => Promise<void>;
  onCancel: () => void;
};

export function IncomeSourceForm({ incomeSource, onDone, onCancel }: Props) {
  const isEdit = Boolean(incomeSource);
  const [form, setForm] = useState<CreateIncomeSourceInput>({
    name: incomeSource?.name ?? '',
    description: incomeSource?.description ?? '',
    expectedAmount: incomeSource?.expectedAmount ? Number(incomeSource.expectedAmount) : undefined,
    isActive: incomeSource?.isActive ?? true,
  });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        name: form.name,
        isActive: form.isActive,
      };
      if (form.description) payload.description = form.description;
      else if (isEdit) payload.description = null;
      if (form.expectedAmount !== undefined && form.expectedAmount > 0) {
        payload.expectedAmount = form.expectedAmount;
      } else if (isEdit) {
        payload.expectedAmount = null;
      }
      const incomeSourceId = incomeSource?.id ?? '';
      await apiFetch(
        isEdit ? `/api/v1/income-sources/${incomeSourceId}` : '/api/v1/income-sources',
        {
          method: isEdit ? 'PATCH' : 'POST',
          body: JSON.stringify(payload),
        },
      );
      await onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao salvar a fonte de renda.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!incomeSource) return;
    if (!window.confirm(`Excluir a fonte de renda "${incomeSource.name}"?`)) return;
    setDeleting(true);
    setError(null);
    try {
      await apiFetch(`/api/v1/income-sources/${incomeSource.id}`, { method: 'DELETE' });
      await onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao excluir a fonte de renda.');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Card className="form-card">
      <h3 className="form-title">{isEdit ? 'Editar fonte de renda' : 'Nova fonte de renda'}</h3>
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
          <Field label="Descrição">
            <Input
              value={form.description}
              onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
              maxLength={300}
            />
          </Field>
          <Field label="Valor esperado (R$)" hint="Quanto a família espera receber por mês.">
            <Input
              type="number"
              step="0.01"
              min="0.01"
              value={form.expectedAmount ?? ''}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  expectedAmount: e.target.value ? Number(e.target.value) : undefined,
                }))
              }
            />
          </Field>
        </div>
        <div className="checkbox-group">
          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(e) => setForm((prev) => ({ ...prev, isActive: e.target.checked }))}
            />
            Ativa
          </label>
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
              {deleting ? 'Excluindo…' : 'Excluir fonte'}
            </Button>
          ) : null}
          <Button type="submit" disabled={submitting}>
            {submitting ? 'Salvando…' : isEdit ? 'Salvar' : 'Criar fonte'}
          </Button>
        </div>
      </form>
    </Card>
  );
}
