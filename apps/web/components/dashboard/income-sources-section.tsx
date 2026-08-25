'use client';

import { useState } from 'react';
import type { IncomeSourceRecord } from '@/lib/api';
import { brl } from '@/lib/format';
import { Badge, Button, Card } from '@/components/ui';
import { IncomeSourceForm } from '@/components/income-source-form';

type Props = {
  incomeSources: IncomeSourceRecord[];
  canManage: boolean;
  onReload: () => Promise<void>;
};

export function IncomeSourcesSection({ incomeSources, canManage, onReload }: Props) {
  const [showIncomeSourceForm, setShowIncomeSourceForm] = useState(false);
  const [editingIncomeSource, setEditingIncomeSource] = useState<IncomeSourceRecord | null>(null);

  return (
    <section className="section">
      <div className="section-head">
        <h2>Fontes de renda</h2>
        {canManage ? (
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setEditingIncomeSource(null);
              setShowIncomeSourceForm((show) => !show);
            }}
          >
            {showIncomeSourceForm || editingIncomeSource ? 'Fechar' : '+ Nova fonte'}
          </Button>
        ) : null}
      </div>
      {editingIncomeSource ? (
        <IncomeSourceForm
          incomeSource={editingIncomeSource}
          onCancel={() => setEditingIncomeSource(null)}
          onDone={async () => {
            setEditingIncomeSource(null);
            setShowIncomeSourceForm(false);
            await onReload();
          }}
        />
      ) : showIncomeSourceForm ? (
        <IncomeSourceForm
          onCancel={() => setShowIncomeSourceForm(false)}
          onDone={async () => {
            setShowIncomeSourceForm(false);
            await onReload();
          }}
        />
      ) : null}
      <Card>
        {incomeSources.length === 0 ? (
          <p className="empty">Nenhuma fonte de renda cadastrada ainda.</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Nome</th>
                  <th className="td-num">Valor esperado</th>
                  <th>Status</th>
                  {canManage ? <th>Ações</th> : null}
                </tr>
              </thead>
              <tbody>
                {incomeSources.map((incomeSource) => (
                  <tr key={incomeSource.id}>
                    <td>{incomeSource.name}</td>
                    <td className="td-num">
                      {incomeSource.expectedAmount ? brl(incomeSource.expectedAmount) : '—'}
                    </td>
                    <td>
                      <Badge tone={incomeSource.isActive ? 'success' : 'neutral'}>
                        {incomeSource.isActive ? 'Ativa' : 'Inativa'}
                      </Badge>
                    </td>
                    {canManage ? (
                      <td>
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={() => {
                            setShowIncomeSourceForm(false);
                            setEditingIncomeSource(incomeSource);
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
