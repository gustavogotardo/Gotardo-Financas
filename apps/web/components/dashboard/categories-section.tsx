'use client';

import { Fragment, useMemo, useState } from 'react';
import type { CategoryRecord } from '@/lib/api';
import { Button, Card } from '@/components/ui';
import { CategoryForm } from '@/components/category-form';

type Props = {
  categories: CategoryRecord[];
  canManage: boolean;
  onReload: () => Promise<void>;
};

export function CategoriesSection({ categories, canManage, onReload }: Props) {
  const [showCategoryForm, setShowCategoryForm] = useState(false);
  const [editingCategory, setEditingCategory] = useState<CategoryRecord | null>(null);

  const groupedCategories = useMemo(() => {
    const parents = categories
      .filter((category) => !category.parentId)
      .sort((a, b) => a.name.localeCompare(b.name));
    const childrenByParent = new Map<string, CategoryRecord[]>();
    for (const category of categories) {
      if (!category.parentId) continue;
      const list = childrenByParent.get(category.parentId);
      if (list) list.push(category);
      else childrenByParent.set(category.parentId, [category]);
    }
    for (const list of childrenByParent.values()) {
      list.sort((a, b) => a.name.localeCompare(b.name));
    }
    const orphanChildren = categories.filter(
      (category) => category.parentId && !childrenByParent.has(category.parentId),
    );
    return { parents, childrenByParent, orphanChildren };
  }, [categories]);

  return (
    <section className="section">
      <div className="section-head">
        <h2>Categorias</h2>
        {canManage ? (
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setEditingCategory(null);
              setShowCategoryForm((show) => !show);
            }}
          >
            {showCategoryForm || editingCategory ? 'Fechar' : '+ Nova categoria'}
          </Button>
        ) : null}
      </div>
      {editingCategory ? (
        <CategoryForm
          category={editingCategory}
          categories={categories}
          onCancel={() => setEditingCategory(null)}
          onDone={async () => {
            setEditingCategory(null);
            setShowCategoryForm(false);
            await onReload();
          }}
        />
      ) : showCategoryForm ? (
        <CategoryForm
          categories={categories}
          onCancel={() => setShowCategoryForm(false)}
          onDone={async () => {
            setShowCategoryForm(false);
            await onReload();
          }}
        />
      ) : null}
      <Card>
        {categories.length === 0 ? (
          <p className="empty">Nenhuma categoria cadastrada ainda.</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Ícone</th>
                  {canManage ? <th>Ações</th> : null}
                </tr>
              </thead>
              <tbody>
                {groupedCategories.parents.map((parent) => {
                  const children = groupedCategories.childrenByParent.get(parent.id) ?? [];
                  return (
                    <Fragment key={parent.id}>
                      <tr>
                        <td>{parent.name}</td>
                        <td className="muted">{parent.icon ?? '—'}</td>
                        {canManage ? (
                          <td>
                            <Button
                              type="button"
                              variant="ghost"
                              onClick={() => {
                                setShowCategoryForm(false);
                                setEditingCategory(parent);
                              }}
                            >
                              Editar
                            </Button>
                          </td>
                        ) : null}
                      </tr>
                      {children.map((child) => (
                        <tr key={child.id}>
                          <td className="subcategory-row">
                            <span className="muted">— </span>
                            {child.name}
                          </td>
                          <td className="muted">{child.icon ?? '—'}</td>
                          {canManage ? (
                            <td>
                              <Button
                                type="button"
                                variant="ghost"
                                onClick={() => {
                                  setShowCategoryForm(false);
                                  setEditingCategory(child);
                                }}
                              >
                                Editar
                              </Button>
                            </td>
                          ) : null}
                        </tr>
                      ))}
                    </Fragment>
                  );
                })}
                {groupedCategories.orphanChildren.map((child) => (
                  <tr key={child.id}>
                    <td className="subcategory-row">
                      <span className="muted">— </span>
                      {child.name}
                    </td>
                    <td className="muted">{child.icon ?? '—'}</td>
                    {canManage ? (
                      <td>
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={() => {
                            setShowCategoryForm(false);
                            setEditingCategory(child);
                          }}
                        >
                          Editar
                        </Button>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </section>
  );
}
