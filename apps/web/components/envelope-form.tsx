'use client';

import { useState, type FormEvent } from 'react';
import { apiFetch, type CreateEnvelopeInput, type EnvelopeRecord } from '@/lib/api';
import { Button, Card, ErrorBox, Field, Input } from './ui';

type Props = {
  envelope?: EnvelopeRecord;
  onDone: () => Promise<void>;
  onCancel: () => void;
};

export function EnvelopeForm({ envelope, onDone, onCancel }: Props) {
  const isEdit = Boolean(envelope);
  const [form, setForm] = useState<CreateEnvelopeInput>({
    name: envelope?.name ?? '',
    icon: envelope?.icon ?? '',
    targetAmount: envelope?.targetAmount ? Number(envelope.targetAmount) : undefined,
  });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const envelopeId = envelope?.id ?? '';
      const payload: Record<string, unknown> = { name: form.name };
      if (form.icon) payload.icon = form.icon;
      if (form.targetAmount !== undefined && form.targetAmount > 0) {
        payload.targetAmount = form.targetAmount;
      } else if (isEdit) {
        payload.targetAmount = null;
      }
      await apiFetch(isEdit ? `/api/v1/envelopes/${envelopeId}` : '/api/v1/envelopes', {
        method: isEdit ? 'PATCH' : 'POST',
        body: JSON.stringify(payload),
      });
      await onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao salvar o envelope.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!envelope) return;
    if (!window.confirm(`Excluir o envelope "${envelope.name}"?`)) return;
    setDeleting(true);
    setError(null);
    try {
      await apiFetch(`/api/v1/envelopes/${envelope.id}`, { method: 'DELETE' });
      await onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao excluir o envelope.');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Card className="form-card">
      <h3 className="form-title">{isEdit ? 'Editar envelope' : 'Novo envelope'}</h3>
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
          <Field label="Meta (R$)" hint="Quanto a família quer destinar.">
            <Input
              type="number"
              step="0.01"
              min="0.01"
              value={form.targetAmount ?? ''}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  targetAmount: e.target.value ? Number(e.target.value) : undefined,
                }))
              }
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
              {deleting ? 'Excluindo…' : 'Excluir envelope'}
            </Button>
          ) : null}
          <Button type="submit" disabled={submitting}>
            {submitting ? 'Salvando…' : isEdit ? 'Salvar' : 'Criar envelope'}
          </Button>
        </div>
      </form>
    </Card>
  );
}
