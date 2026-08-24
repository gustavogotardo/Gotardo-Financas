'use client';

import { useMemo, useState } from 'react';
import {
  apiFetch,
  type AnomalyRow,
  type PaymentMethodRow,
  type TransactionRecord,
} from '@/lib/api';
import { brl, formatDate, paymentMethodLabel, statusLabel, statusTone } from '@/lib/format';
import { Badge, Button, Card, ErrorBox } from '@/components/ui';

type Props = {
  transactions: TransactionRecord[];
  paymentMethods: PaymentMethodRow[];
  anomalies: AnomalyRow[];
  canManage: boolean;
  onReload: () => Promise<void>;
};

export function TransactionsSection({
  transactions,
  paymentMethods,
  anomalies,
  canManage,
  onReload,
}: Props) {
  const [error, setError] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [applyingId, setApplyingId] = useState<string | null>(null);

  const anomalyById = useMemo(() => {
    const map = new Map<string, AnomalyRow>();
    for (const row of anomalies) {
      if (row.isAnomaly) map.set(row.transactionId, row);
    }
    return map;
  }, [anomalies]);

  const methodGroups = useMemo(() => {
    const expenseByMethod = new Map(
      paymentMethods.map((row) => [row.method ?? '__none__', Number(row.expense)]),
    );
    const map = new Map<string | null, TransactionRecord[]>();
    for (const tx of transactions) {
      const key = tx.paymentMethod;
      const list = map.get(key);
      if (list) list.push(tx);
      else map.set(key, [tx]);
    }
    return [...map.entries()]
      .map(([method, items]) => ({
        method,
        items: items.sort((a, b) => b.date.localeCompare(a.date)),
        expense: expenseByMethod.get(method ?? '__none__') ?? 0,
      }))
      .sort((a, b) => b.expense - a.expense);
  }, [transactions, paymentMethods]);

  async function confirmTransaction(id: string) {
    setConfirmingId(id);
    setError(null);
    try {
      await apiFetch(`/api/v1/transactions/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'CONFIRMED' }),
      });
      await onReload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao confirmar a transação.');
    } finally {
      setConfirmingId(null);
    }
  }

  async function cancelTransaction(id: string, description: string) {
    if (!window.confirm(`Cancelar a transação "${description}"?`)) return;
    setDeletingId(id);
    setError(null);
    try {
      await apiFetch(`/api/v1/transactions/${id}`, { method: 'DELETE' });
      await onReload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao cancelar a transação.');
    } finally {
      setDeletingId(null);
    }
  }

  async function applySuggestion(tx: TransactionRecord) {
    if (!tx.suggestedCategory) return;
    setApplyingId(tx.id);
    setError(null);
    try {
      await apiFetch(`/api/v1/transactions/${tx.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ categoryId: tx.suggestedCategory.id }),
      });
      await onReload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao aplicar a sugestão.');
    } finally {
      setApplyingId(null);
    }
  }

  return (
    <section className="section">
      <h2>Transações do mês por forma de pagamento</h2>
      {error ? <ErrorBox>{error}</ErrorBox> : null}
      {transactions.length === 0 ? (
        <Card>
          <p className="empty">Nenhuma transação neste mês.</p>
        </Card>
      ) : (
        methodGroups.map((group) => (
          <Card className="method-block" key={group.method ?? 'none'}>
            <div className="method-head">
              <h3>{paymentMethodLabel(group.method)}</h3>
              <Badge tone="neutral">
                {group.items.length} transaç{group.items.length === 1 ? 'ão' : 'ões'}
              </Badge>
            </div>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Data</th>
                    <th>Descrição</th>
                    <th>Categoria</th>
                    <th>Conta</th>
                    <th>Status</th>
                    <th className="td-num">Valor</th>
                    {canManage ? <th>Ações</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {group.items.map((tx) => {
                    const positive = tx.type === 'INCOME';
                    return (
                      <tr key={tx.id}>
                        <td>{formatDate(tx.date)}</td>
                        <td>{tx.description}</td>
                        <td>
                          {tx.category ? (
                            tx.category.name
                          ) : tx.suggestedCategory ? (
                            <span className="suggestion">
                              Sugerido: {tx.suggestedCategory.name}
                            </span>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="muted">{tx.account?.name ?? '—'}</td>
                        <td>
                          <Badge tone={statusTone(tx.status)}>{statusLabel(tx.status)}</Badge>
                          {anomalyById.has(tx.id) ? (
                            <span title={anomalyById.get(tx.id)?.reason ?? undefined}>
                              <Badge tone="danger">Anomalia</Badge>
                            </span>
                          ) : null}
                        </td>
                        <td className={`td-num ${positive ? 'td-pos' : 'td-neg'}`}>
                          {positive ? '+' : '−'}
                          {brl(tx.amount)}
                        </td>
                        <td>
                          {canManage && tx.status === 'PENDING' ? (
                            <>
                              <Button
                                type="button"
                                variant="ghost"
                                disabled={
                                  confirmingId === tx.id ||
                                  deletingId === tx.id ||
                                  applyingId === tx.id
                                }
                                onClick={() => void confirmTransaction(tx.id)}
                              >
                                {confirmingId === tx.id ? 'Confirmando…' : 'Confirmar'}
                              </Button>
                              {!tx.category && tx.suggestedCategory ? (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  disabled={
                                    confirmingId === tx.id ||
                                    deletingId === tx.id ||
                                    applyingId === tx.id
                                  }
                                  onClick={() => void applySuggestion(tx)}
                                >
                                  {applyingId === tx.id
                                    ? 'Aplicando…'
                                    : `Aplicar ${tx.suggestedCategory.name}`}
                                </Button>
                              ) : null}
                              <Button
                                type="button"
                                variant="ghost"
                                disabled={
                                  confirmingId === tx.id ||
                                  deletingId === tx.id ||
                                  applyingId === tx.id
                                }
                                onClick={() => void cancelTransaction(tx.id, tx.description)}
                              >
                                {deletingId === tx.id ? 'Cancelando…' : 'Cancelar'}
                              </Button>
                            </>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        ))
      )}
    </section>
  );
}
