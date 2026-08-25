'use client';

import { useState } from 'react';
import type { EnvelopeRecord } from '@/lib/api';
import { brl } from '@/lib/format';
import { Button, Card } from '@/components/ui';
import { AllocationForm } from '@/components/allocation-form';
import { EnvelopeForm } from '@/components/envelope-form';

type Props = {
  envelopes: EnvelopeRecord[];
  canManage: boolean;
  onReload: () => Promise<void>;
};

export function EnvelopesSection({ envelopes, canManage, onReload }: Props) {
  const [showEnvelopeForm, setShowEnvelopeForm] = useState(false);
  const [editingEnvelope, setEditingEnvelope] = useState<EnvelopeRecord | null>(null);
  const [allocatingEnvelope, setAllocatingEnvelope] = useState<EnvelopeRecord | null>(null);

  return (
    <section className="section">
      <div className="section-head">
        <h2>Envelopes</h2>
        {canManage ? (
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              if (showEnvelopeForm || editingEnvelope) {
                setShowEnvelopeForm(false);
                setEditingEnvelope(null);
              } else {
                setShowEnvelopeForm(true);
              }
            }}
          >
            {showEnvelopeForm || editingEnvelope ? 'Fechar' : '+ Novo envelope'}
          </Button>
        ) : null}
      </div>
      {editingEnvelope ? (
        <EnvelopeForm
          key={editingEnvelope.id}
          envelope={editingEnvelope}
          onCancel={() => setEditingEnvelope(null)}
          onDone={async () => {
            setEditingEnvelope(null);
            setShowEnvelopeForm(false);
            await onReload();
          }}
        />
      ) : showEnvelopeForm ? (
        <EnvelopeForm
          onCancel={() => setShowEnvelopeForm(false)}
          onDone={async () => {
            setShowEnvelopeForm(false);
            await onReload();
          }}
        />
      ) : null}
      {allocatingEnvelope ? (
        <AllocationForm
          key={allocatingEnvelope.id}
          envelope={allocatingEnvelope}
          onCancel={() => setAllocatingEnvelope(null)}
          onDone={async () => {
            setAllocatingEnvelope(null);
            await onReload();
          }}
        />
      ) : null}
      <Card>
        {envelopes.length === 0 ? (
          <p className="empty">Nenhum envelope cadastrado ainda.</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Envelope</th>
                  <th className="td-num">Meta</th>
                  <th className="td-num">Alocado</th>
                  <th className="td-num">Gasto</th>
                  <th className="td-num">Saldo</th>
                  {canManage ? <th>Ações</th> : null}
                </tr>
              </thead>
              <tbody>
                {envelopes.map((envelope) => {
                  const target = Number(envelope.targetAmount ?? 0);
                  const allocated = Number(envelope.allocated);
                  const progress = target > 0 ? Math.min(100, (allocated / target) * 100) : 0;
                  return (
                    <tr key={envelope.id}>
                      <td>
                        <span className="envelope-name">
                          {envelope.icon ? <span className="muted">{envelope.icon}</span> : null}{' '}
                          {envelope.name}
                        </span>
                        {target > 0 ? (
                          <span className="progress" title={`${progress.toFixed(0)}% da meta`}>
                            <span className="progress-fill" style={{ width: `${progress}%` }} />
                          </span>
                        ) : null}
                      </td>
                      <td className="td-num">{target > 0 ? brl(target) : '—'}</td>
                      <td className="td-num">{brl(envelope.allocated)}</td>
                      <td className="td-num td-neg">{brl(envelope.spent)}</td>
                      <td
                        className={`td-num ${Number(envelope.balance) < 0 ? 'td-neg' : 'td-pos'}`}
                      >
                        {brl(envelope.balance)}
                      </td>
                      {canManage ? (
                        <td>
                          <Button
                            type="button"
                            variant="ghost"
                            onClick={() => setAllocatingEnvelope(envelope)}
                          >
                            Alocar
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            onClick={() => {
                              setShowEnvelopeForm(false);
                              setEditingEnvelope(envelope);
                            }}
                          >
                            Editar
                          </Button>
                        </td>
                      ) : null}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </section>
  );
}
