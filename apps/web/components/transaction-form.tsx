'use client';

import { useState, type FormEvent } from 'react';
import {
  apiFetch,
  type AccountRecord,
  type CategoryRecord,
  type CreateTransactionInput,
  type IncomeSourceRecord,
} from '@/lib/api';
import { paymentMethodLabel, statusLabel, transactionTypeLabel } from '@/lib/format';
import { Button, Card, ErrorBox, Field, Input, Select } from './ui';

const PAYMENT_METHODS = ['PIX', 'BOLETO', 'CREDIT_CARD', 'DEBIT_CARD', 'TRANSFER', 'CASH', 'OTHER'];

const TYPES = ['INCOME', 'EXPENSE', 'TRANSFER'];
const STATUSES = ['CONFIRMED', 'PENDING', 'REJECTED', 'REVIEW'];

type Props = {
  accounts: AccountRecord[];
  categories: CategoryRecord[];
  incomeSources: IncomeSourceRecord[];
  onCreated: () => Promise<void>;
  onCancel: () => void;
};

export function TransactionForm({
  accounts,
  categories,
  incomeSources,
  onCreated,
  onCancel,
}: Props) {
  const [form, setForm] = useState<
    CreateTransactionInput & { paymentMethod: string; categoryId: string; incomeSourceId: string }
  >({
    description: '',
    amount: 0,
    type: 'EXPENSE',
    status: 'CONFIRMED',
    paymentMethod: '',
    accountId: accounts[0]?.id ?? '',
    categoryId: '',
    incomeSourceId: '',
    date: new Date().toISOString().slice(0, 10),
  });
  const [installments, setInstallments] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const payload: CreateTransactionInput = {
        description: form.description,
        amount: Number(form.amount),
        type: form.type,
        status: form.status,
        accountId: form.accountId,
        date: `${form.date}T12:00:00.000Z`,
        ...(form.categoryId ? { categoryId: form.categoryId } : {}),
        ...(form.incomeSourceId ? { incomeSourceId: form.incomeSourceId } : {}),
        ...(form.paymentMethod ? { paymentMethod: form.paymentMethod } : {}),
        ...(Number(installments) >= 2 ? { installments: Number(installments) } : {}),
      };
      await apiFetch('/api/v1/transactions', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      await onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao criar a transação.');
    } finally {
      setSubmitting(false);
    }
  }

  const parents = categories.filter((category) => !category.parentId);
  const children = categories.filter((category) => category.parentId);

  return (
    <Card className="form-card">
      <h3 className="form-title">Nova transação</h3>
      <form onSubmit={onSubmit}>
        <div className="form-grid">
          <Field label="Descrição">
            <Input
              value={form.description}
              onChange={(e) => update('description', e.target.value)}
              maxLength={300}
              required
            />
          </Field>
          <Field label="Valor (R$)">
            <Input
              type="number"
              step="0.01"
              min="0.01"
              value={form.amount || ''}
              onChange={(e) => update('amount', Number(e.target.value))}
              required
            />
          </Field>
          <Field label="Tipo">
            <Select value={form.type} onChange={(e) => update('type', e.target.value)}>
              {TYPES.map((type) => (
                <option key={type} value={type}>
                  {transactionTypeLabel(type)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Forma de pagamento">
            <Select
              value={form.paymentMethod}
              onChange={(e) => update('paymentMethod', e.target.value)}
            >
              <option value="">Sem método</option>
              {PAYMENT_METHODS.map((method) => (
                <option key={method} value={method}>
                  {paymentMethodLabel(method)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Conta">
            <Select
              value={form.accountId}
              onChange={(e) => update('accountId', e.target.value)}
              required
            >
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Categoria">
            <Select value={form.categoryId} onChange={(e) => update('categoryId', e.target.value)}>
              <option value="">Sem categoria</option>
              {[...parents, ...children].map((category) => (
                <option key={category.id} value={category.id}>
                  {category.parentId ? `— ${category.name}` : category.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Fonte de renda">
            <Select
              value={form.incomeSourceId}
              onChange={(e) => update('incomeSourceId', e.target.value)}
            >
              <option value="">Sem fonte de renda</option>
              {incomeSources.map((incomeSource) => (
                <option key={incomeSource.id} value={incomeSource.id}>
                  {incomeSource.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Status">
            <Select value={form.status} onChange={(e) => update('status', e.target.value)}>
              {STATUSES.map((status) => (
                <option key={status} value={status}>
                  {statusLabel(status)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Data">
            <Input
              type="date"
              value={form.date}
              onChange={(e) => update('date', e.target.value)}
              required
            />
          </Field>
          <Field label="Número de parcelas" hint="Opcional, entre 2 e 60">
            <Input
              type="number"
              min={2}
              max={60}
              value={installments}
              onChange={(e) => setInstallments(e.target.value)}
            />
          </Field>
        </div>
        {error ? <ErrorBox>{error}</ErrorBox> : null}
        <div className="form-actions">
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancelar
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? 'Salvando…' : 'Criar transação'}
          </Button>
        </div>
      </form>
    </Card>
  );
}
