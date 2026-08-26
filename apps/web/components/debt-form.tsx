'use client';

import { useState, type FormEvent } from 'react';
import { apiFetch, type CreateDebtInput, type DebtRecord } from '@/lib/api';
import { debtStatusLabel } from '@/lib/format';
import { Button, Card, ErrorBox, Field, Input, Select } from './ui';

type Props = {
  debt?: DebtRecord;
  onDone: () => Promise<void>;
  onCancel: () => void;
};

const STATUSES = ['ACTIVE', 'PAID_OFF', 'CANCELLED'];

export function DebtForm({ debt, onDone, onCancel }: Props) {
  const isEdit = Boolean(debt);
  const [form, setForm] = useState<CreateDebtInput>({
    name: debt?.name ?? '',
    creditor: debt?.creditor ?? '',
    totalAmount: debt ? Number(debt.totalAmount) : 0,
    interestRate: debt?.interestRate ? Number(debt.interestRate) : undefined,
    installmentAmount: debt?.installmentAmount ? Number(debt.installmentAmount) : undefined,
    dueDay: debt?.dueDay ?? undefined,
  });
  const [status, setStatus] = useState(debt?.status ?? 'ACTIVE');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const debtId = debt?.id ?? '';
      const payload: Record<string, unknown> = {
        name: form.name,
        totalAmount: form.totalAmount,
      };
      if (form.creditor) payload.creditor = form.creditor;
      else if (isEdit) payload.creditor = null;
      if (form.interestRate !== undefined && form.interestRate > 0) {
        payload.interestRate = form.interestRate;
      } else if (isEdit) {
        payload.interestRate = null;
      }
      if (form.installmentAmount !== undefined && form.installmentAmount > 0) {
        payload.installmentAmount = form.installmentAmount;
      } else if (isEdit) {
        payload.installmentAmount = null;
      }
      if (form.dueDay !== undefined && form.dueDay > 0) {
        payload.dueDay = form.dueDay;
      } else if (isEdit) {
        payload.dueDay = null;
      }
      if (isEdit) payload.status = status;

      await apiFetch(isEdit ? `/api/v1/debts/${debtId}` : '/api/v1/debts', {
        method: isEdit ? 'PATCH' : 'POST',
        body: JSON.stringify(payload),
      });
      await onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao salvar a dívida.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!debt) return;
    if (!window.confirm(`Excluir a dívida "${debt.name}"?`)) return;
    setDeleting(true);
    setError(null);
    try {
      await apiFetch(`/api/v1/debts/${debt.id}`, { method: 'DELETE' });
      await onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao excluir a dívida.');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Card className="form-card">
      <h3 className="form-title">{isEdit ? 'Editar dívida' : 'Nova dívida'}</h3>
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
          <Field label="Credor" hint="Opcional.">
            <Input
              value={form.creditor}
              onChange={(e) => setForm((prev) => ({ ...prev, creditor: e.target.value }))}
              maxLength={100}
            />
          </Field>
          <Field label="Valor total (R$)">
            <Input
              type="number"
              step="0.01"
              min="0.01"
              value={form.totalAmount || ''}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, totalAmount: Number(e.target.value) }))
              }
              required
            />
          </Field>
          <Field label="Taxa de juros (%)" hint="Opcional.">
            <Input
              type="number"
              step="0.01"
              min="0.01"
              value={form.interestRate ?? ''}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  interestRate: e.target.value ? Number(e.target.value) : undefined,
                }))
              }
            />
          </Field>
          <Field label="Valor da parcela (R$)" hint="Opcional.">
            <Input
              type="number"
              step="0.01"
              min="0.01"
              value={form.installmentAmount ?? ''}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  installmentAmount: e.target.value ? Number(e.target.value) : undefined,
                }))
              }
            />
          </Field>
          <Field label="Dia de vencimento" hint="Opcional, de 1 a 28.">
            <Input
              type="number"
              step="1"
              min="1"
              max="28"
              value={form.dueDay ?? ''}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  dueDay: e.target.value ? Number(e.target.value) : undefined,
                }))
              }
            />
          </Field>
          {isEdit ? (
            <Field label="Status">
              <Select value={status} onChange={(e) => setStatus(e.target.value)}>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {debtStatusLabel(s)}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}
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
              {deleting ? 'Excluindo…' : 'Excluir dívida'}
            </Button>
          ) : null}
          <Button type="submit" disabled={submitting}>
            {submitting ? 'Salvando…' : isEdit ? 'Salvar' : 'Criar dívida'}
          </Button>
        </div>
      </form>
    </Card>
  );
}
