'use client';

import { useState, type FormEvent } from 'react';
import { apiFetch, type CreateAccountInput } from '@/lib/api';
import { accountTypeLabel } from '@/lib/format';
import { Button, Card, ErrorBox, Field, Input, Select } from './ui';

const ACCOUNT_TYPES = ['CHECKING', 'SAVINGS', 'INVESTMENT', 'CASH'];

type Props = {
  onCreated: () => Promise<void>;
  onCancel: () => void;
};

export function AccountForm({ onCreated, onCancel }: Props) {
  const [form, setForm] = useState<CreateAccountInput>({
    name: '',
    type: 'CHECKING',
    institution: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await apiFetch('/api/v1/accounts', {
        method: 'POST',
        body: JSON.stringify({
          name: form.name,
          type: form.type,
          ...(form.institution ? { institution: form.institution } : {}),
        }),
      });
      await onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao criar a conta.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card className="form-card">
      <h3 className="form-title">Nova conta</h3>
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
        </div>
        {error ? <ErrorBox>{error}</ErrorBox> : null}
        <div className="form-actions">
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancelar
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? 'Salvando…' : 'Criar conta'}
          </Button>
        </div>
      </form>
    </Card>
  );
}
