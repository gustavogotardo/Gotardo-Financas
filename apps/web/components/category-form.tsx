'use client';

import { useState, type FormEvent } from 'react';
import { apiFetch, type CategoryRecord, type CreateCategoryInput } from '@/lib/api';
import { Button, Card, ErrorBox, Field, Input, Select } from './ui';

type Props = {
  category?: CategoryRecord;
  categories: CategoryRecord[];
  onDone: () => Promise<void>;
  onCancel: () => void;
};

export function CategoryForm({ category, categories, onDone, onCancel }: Props) {
  const isEdit = Boolean(category);
  const [form, setForm] = useState<CreateCategoryInput>({
    name: category?.name ?? '',
    icon: category?.icon ?? '',
    parentId: category?.parentId ?? '',
    isEssential: category?.isEssential ?? false,
    isFixed: category?.isFixed ?? false,
  });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const parents = categories.filter((item) => !item.parentId && item.id !== category?.id);
  const hasChildren = Boolean(category && categories.some((item) => item.parentId === category.id));

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        name: form.name,
        isEssential: form.isEssential,
        isFixed: form.isFixed,
      };
      if (form.icon) payload.icon = form.icon;
      if (isEdit && !category) return;
      if (isEdit) payload.parentId = form.parentId || null;
      else if (form.parentId) payload.parentId = form.parentId;
      const categoryId = category?.id ?? '';
      await apiFetch(isEdit ? `/api/v1/categories/${categoryId}` : '/api/v1/categories', {
        method: isEdit ? 'PATCH' : 'POST',
        body: JSON.stringify(payload),
      });
      await onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao salvar a categoria.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!category) return;
    if (!window.confirm(`Excluir a categoria "${category.name}"?`)) return;
    setDeleting(true);
    setError(null);
    try {
      await apiFetch(`/api/v1/categories/${category.id}`, { method: 'DELETE' });
      await onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao excluir a categoria.');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Card className="form-card">
      <h3 className="form-title">{isEdit ? 'Editar categoria' : 'Nova categoria'}</h3>
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
              {parents.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
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
        <div className="checkbox-group">
          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={form.isEssential}
              onChange={(e) => setForm((prev) => ({ ...prev, isEssential: e.target.checked }))}
            />
            Essencial
          </label>
          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={form.isFixed}
              onChange={(e) => setForm((prev) => ({ ...prev, isFixed: e.target.checked }))}
            />
            Fixa/recorrente
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
              disabled={deleting || hasChildren}
              title={hasChildren ? 'Exclua as subcategorias primeiro' : undefined}
            >
              {deleting ? 'Excluindo…' : hasChildren ? 'Tem subcategorias' : 'Excluir categoria'}
            </Button>
          ) : null}
          <Button type="submit" disabled={submitting}>
            {submitting ? 'Salvando…' : isEdit ? 'Salvar' : 'Criar categoria'}
          </Button>
        </div>
      </form>
    </Card>
  );
}
