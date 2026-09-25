'use client';

import { useState, type FormEvent } from 'react';
import { apiFetch, type AccountRecord, type CreateAccountInput } from '@/lib/api';
import { accountTypeLabel } from '@/lib/format';
import { Button, Card, ErrorBox, Field, Input, Select } from './ui';

const ACCOUNT_TYPES = ['CHECKING', 'SAVINGS', 'INVESTMENT', 'CASH', 'CREDIT_CARD'];

type Props = {
  account?: AccountRecord;
  onDone: () => Promise<void>;
  onCancel: () => void;
};

export function AccountForm({ account, onDone, onCancel }: Props) {
  const isEdit = Boolean(account);
  const [form, setForm] = useState<CreateAccountInput>({
    name: account?.name ?? '',
    type: account?.type ?? 'CHECKING',
    institution: account?.institution ?? '',
    creditLimit: account?.creditLimit ? Number(account.creditLimit) : undefined,
    billingDay: account?.billingDay ?? undefined,
    dueDay: account?.dueDay ?? undefined,
  });
  const [openingBalance, setOpeningBalance] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      if (isEdit && !account) return;
      const accountId = account?.id ?? '';
      const saved = await apiFetch<{ id: string }>(
        isEdit ? `/api/v1/accounts/${accountId}` : '/api/v1/accounts',
        {
          method: isEdit ? 'PATCH' : 'POST',
          body: JSON.stringify({
            name: form.name,
            type: form.type,
            ...(form.institution ? { institution: form.institution } : {}),
            ...(form.type === 'CREDIT_CARD' && form.creditLimit
              ? { creditLimit: form.creditLimit }
              : {}),
            ...(form.type === 'CREDIT_CARD' && form.billingDay
              ? { billingDay: form.billingDay }
              : {}),
            ...(form.type === 'CREDIT_CARD' && form.dueDay ? { dueDay: form.dueDay } : {}),
          }),
        },
      );
      // Não há campo de saldo na conta em si — o saldo é sempre a soma das
      // transações confirmadas (ver balanceDelta() na API). Para dar à conta
      // nova o saldo que ela já tinha no banco antes de existir aqui, lança
      // uma transação de ajuste confirmada, pelo mesmo caminho que qualquer
      // outra transação usa.
      const openingValue = Number(openingBalance.replace(',', '.'));
      if (!isEdit && openingValue) {
        await apiFetch('/api/v1/transactions', {
          method: 'POST',
          body: JSON.stringify({
            description: 'Saldo inicial',
            amount: Math.abs(openingValue),
            type: openingValue >= 0 ? 'INCOME' : 'EXPENSE',
            status: 'CONFIRMED',
            accountId: saved.id,
            date: new Date().toISOString(),
          }),
        });
      }
      await onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao salvar a conta.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!account) return;
    if (!window.confirm(`Excluir a conta "${account.name}"?`)) return;
    setDeleting(true);
    setError(null);
    try {
      await apiFetch(`/api/v1/accounts/${account.id}`, { method: 'DELETE' });
      await onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao excluir a conta.');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Card className="form-card">
      <h3 className="form-title">{isEdit ? 'Editar conta' : 'Nova conta'}</h3>
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
          <Field label="Tipo">
            <Select
              value={form.type}
              onChange={(e) => setForm((prev) => ({ ...prev, type: e.target.value }))}
            >
              {ACCOUNT_TYPES.map((type) => (
                <option key={type} value={type}>
                  {accountTypeLabel(type)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Instituição">
            <Input
              value={form.institution}
              onChange={(e) => setForm((prev) => ({ ...prev, institution: e.target.value }))}
              maxLength={100}
            />
          </Field>
          {!isEdit ? (
            <Field
              label="Saldo inicial (R$)"
              hint="O saldo que a conta já tem hoje no banco, antes de qualquer transação lançada aqui"
            >
              <Input
                type="number"
                step="0.01"
                value={openingBalance}
                onChange={(e) => setOpeningBalance(e.target.value)}
                placeholder="0,00"
              />
            </Field>
          ) : null}
          {form.type === 'CREDIT_CARD' ? (
            <>
              <Field label="Limite (R$)">
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.creditLimit ?? ''}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      creditLimit: e.target.value ? Number(e.target.value) : undefined,
                    }))
                  }
                />
              </Field>
              <Field label="Dia de fechamento">
                <Input
                  type="number"
                  min={1}
                  max={28}
                  value={form.billingDay ?? ''}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      billingDay: e.target.value ? Number(e.target.value) : undefined,
                    }))
                  }
                />
              </Field>
              <Field label="Dia de vencimento">
                <Input
                  type="number"
                  min={1}
                  max={28}
                  value={form.dueDay ?? ''}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      dueDay: e.target.value ? Number(e.target.value) : undefined,
                    }))
                  }
                />
              </Field>
            </>
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
              {deleting ? 'Excluindo…' : 'Excluir conta'}
            </Button>
          ) : null}
          <Button type="submit" disabled={submitting}>
            {submitting ? 'Salvando…' : isEdit ? 'Salvar' : 'Criar conta'}
          </Button>
        </div>
      </form>
    </Card>
  );
}
