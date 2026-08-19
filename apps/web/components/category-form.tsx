'use client';

import { useState, type FormEvent } from 'react';
import { apiFetch, type CategoryRecord, type CreateCategoryInput } from '@/lib/api';
import { Button, Card, ErrorBox, Field, Input, Select } from './ui';

type Props = {
  categories: CategoryRecord[];
  onCreated: () => Promise<void>;
  onCancel: () => void;
};

export function CategoryForm({ categories, onCreated, onCancel }: Props) {
  const [form, setForm] = useState<CreateCategoryInput>({ name: '', icon: '', parentId: '' });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await apiFetch('/api/v1/categories', {
        method: 'POST',
        body: JSON.stringify({
          name: form.name,
          ...(form.icon ? { icon: form.icon } : {}),
          ...(form.parentId ? { parentId: form.parentId } : {}),
        }),
      });
      await onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao criar a categoria.');
    } finally {
      setSubmitting(false);
    }
  }

  const parents = categories.filter((category) => !category.parentId);

  return (
    <Card className="form-card">
      <h3 className="form-title">Nova categoria</h3>
      <form onSubmit={onSubmit}>
        <div className="form-grid">
          <Field label="Nome">
            <Input
              value={form.name}
              onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
              maxLength={60}
              required
            />
          </Field>
          <Field label="Categoria pai">
            <Select
              value={form.parentId}
              onChange={(e) => setForm((prev) => ({ ...prev, parentId: e.target.value }))}
            >
              <option value="">Sem categoria pai</option>
              {parents.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Ícone" hint="Emoji ou texto curto.">
            <Input
              value={form.icon}
              onChange={(e) => setForm((prev) => ({ ...prev, icon: e.target.value }))}
              maxLength={50}
            />
          </Field>
        </div>
        {error ? <ErrorBox>{error}</ErrorBox> : null}
        <div className="form-actions">
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancelar
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? 'Salvando…' : 'Criar categoria'}
          </Button>
        </div>
      </form>
    </Card>
  );
}
