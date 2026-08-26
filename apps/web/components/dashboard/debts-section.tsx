'use client';

import { useState } from 'react';
import type { DebtRecord } from '@/lib/api';
import { brl, debtStatusLabel } from '@/lib/format';
import { Badge, Button, Card } from '@/components/ui';
import { DebtForm } from '@/components/debt-form';
import { DebtPaymentForm } from '@/components/debt-payment-form';

type Props = {
  debts: DebtRecord[];
  canManage: boolean;
  onReload: () => Promise<void>;
};

function debtStatusTone(status: string): 'success' | 'danger' | 'info' {
  switch (status) {
    case 'PAID_OFF':
      return 'success';
    case 'CANCELLED':
      return 'danger';
    default:
      return 'info';
  }
}

export function DebtsSection({ debts, canManage, onReload }: Props) {
  const [showDebtForm, setShowDebtForm] = useState(false);
  const [editingDebt, setEditingDebt] = useState<DebtRecord | null>(null);
  const [payingDebt, setPayingDebt] = useState<DebtRecord | null>(null);

  return (
    <section className="section">
      <div className="section-head">
        <h2>Dívidas</h2>
        {canManage ? (
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              if (showDebtForm || editingDebt) {
                setShowDebtForm(false);
                setEditingDebt(null);
              } else {
                setShowDebtForm(true);
              }
            }}
          >
            {showDebtForm || editingDebt ? 'Fechar' : '+ Nova dívida'}
          </Button>
        ) : null}
      </div>

      {editingDebt ? (
        <DebtForm
          key={editingDebt.id}
          debt={editingDebt}
          onCancel={() => setEditingDebt(null)}
          onDone={async () => {
            setEditingDebt(null);
            setShowDebtForm(false);
            await onReload();
          }}
        />
      ) : showDebtForm ? (
        <DebtForm
          onCancel={() => setShowDebtForm(false)}
          onDone={async () => {
            setShowDebtForm(false);
            await onReload();
          }}
        />
      ) : null}

      {payingDebt ? (
        <DebtPaymentForm
          key={payingDebt.id}
          debt={payingDebt}
          onCancel={() => setPayingDebt(null)}
          onDone={async () => {
            setPayingDebt(null);
            await onReload();
          }}
        />
      ) : null}

      {debts.length === 0 ? (
        <Card>
          <p className="empty">Nenhuma dívida cadastrada ainda.</p>
        </Card>
      ) : (
        <div className="goal-grid">
          {debts.map((debt) => {
            const total = Number(debt.totalAmount);
            const paid = Number(debt.paidAmount);
            const progress = total > 0 ? Math.min(100, Math.max(0, (paid / total) * 100)) : 0;
            return (
              <Card key={debt.id} className="goal-card">
                <div className="goal-card-head">
                  <span className="goal-card-title">{debt.name}</span>
                  <div className="goal-card-badges">
                    <Badge tone={debtStatusTone(debt.status)}>{debtStatusLabel(debt.status)}</Badge>
                  </div>
                </div>

                {debt.creditor ? <p className="muted">{debt.creditor}</p> : null}

                <div className="progress" title={`${progress.toFixed(0)}% quitado`}>
                  <span className="progress-fill" style={{ width: `${progress}%` }} />
                </div>
                <div className="goal-card-amounts">
                  <span>
                    {brl(debt.paidAmount)} / {brl(debt.totalAmount)}
                  </span>
                  <span className="muted">{progress.toFixed(0)}%</span>
                </div>

                <p className="muted small">Restante: {brl(debt.remainingAmount)}</p>
                {debt.installmentAmount ? (
                  <p className="muted small">Parcela: {brl(debt.installmentAmount)}</p>
                ) : null}
                {debt.dueDay ? <p className="muted small">Vencimento: dia {debt.dueDay}</p> : null}
                {debt.interestRate ? (
                  <p className="muted small">Juros: {debt.interestRate}%</p>
                ) : null}

                {canManage ? (
                  <div className="form-actions">
                    <Button type="button" variant="ghost" onClick={() => setPayingDebt(debt)}>
                      Registrar pagamento
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => {
                        setShowDebtForm(false);
                        setEditingDebt(debt);
                      }}
                    >
                      Editar
                    </Button>
                  </div>
                ) : null}
              </Card>
            );
          })}
        </div>
      )}
    </section>
  );
}
