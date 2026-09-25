'use client';

import { useMemo, useState } from 'react';
import {
  apiFetch,
  type AnomalyRow,
  type CategoryRecord,
  type FamilyMember,
  type PaymentMethodRow,
  type TransactionRecord,
} from '@/lib/api';
import { brl, formatDate, paymentMethodLabel, statusLabel, statusTone } from '@/lib/format';
import { Badge, Button, Card, ErrorBox, Field, Input, Select } from '@/components/ui';

const PAYMENT_METHODS = ['PIX', 'BOLETO', 'CREDIT_CARD', 'DEBIT_CARD', 'TRANSFER', 'CASH', 'OTHER'];

// Sentinelas do formulário de edição em massa: precisam ser distintas de um
// id/valor real e de "" (que já significa "sem categoria"/"sem método" no
// formulário de uma única transação), para dar pra distinguir "não alterar
// este campo nas transações selecionadas" de "limpar o campo".
const NO_CHANGE = '__no_change__';
const CLEAR = '__clear__';

type Props = {
  transactions: TransactionRecord[];
  paymentMethods: PaymentMethodRow[];
  categories: CategoryRecord[];
  anomalies: AnomalyRow[];
  members: FamilyMember[];
  canManage: boolean;
  onReload: () => Promise<void>;
};

const SHARED_FILTER = '__shared__';

type BulkEditForm = {
  categoryId: string;
  paymentMethod: string;
  description: string;
};

const groupKey = (method: string | null): string => method ?? '__none__';

export function TransactionsSection({
  transactions,
  paymentMethods,
  categories,
  anomalies,
  members,
  canManage,
  onReload,
}: Props) {
  const [error, setError] = useState<string | null>(null);
  const [memberFilter, setMemberFilter] = useState('');
  const [confirmingAll, setConfirmingAll] = useState(false);

  // Só um bloco (forma de pagamento) pode estar em modo de edição/seleção
  // por vez — evita ambiguidade de qual bloco um "selecionar todas"/edição
  // em massa se aplica quando vários estivessem abertos ao mesmo tempo.
  const [activeBlock, setActiveBlock] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkEditOpen, setBulkEditOpen] = useState(false);
  const [bulkEditForm, setBulkEditForm] = useState<BulkEditForm>({
    categoryId: NO_CHANGE,
    paymentMethod: NO_CHANGE,
    description: '',
  });

  const orderedCategories = useMemo(() => {
    const parents = categories.filter((category) => !category.parentId);
    const children = categories.filter((category) => category.parentId);
    return [...parents, ...children];
  }, [categories]);

  const filteredTransactions = useMemo(() => {
    if (!memberFilter) return transactions;
    if (memberFilter === SHARED_FILTER) return transactions.filter((tx) => !tx.memberId);
    return transactions.filter((tx) => tx.memberId === memberFilter);
  }, [transactions, memberFilter]);

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
    for (const tx of filteredTransactions) {
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
  }, [filteredTransactions, paymentMethods]);

  async function confirmAll() {
    const pending = filteredTransactions.filter((tx) => tx.status === 'PENDING');
    if (pending.length === 0) return;
    if (!window.confirm(`Confirmar ${pending.length} transação(ões) pendente(s)?`)) return;
    setConfirmingAll(true);
    setError(null);
    try {
      for (const tx of pending) {
        await apiFetch(`/api/v1/transactions/${tx.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ status: 'CONFIRMED' }),
        });
      }
      await onReload();
    } catch (err) {
      setError(
        err instanceof Error
          ? `Falha ao confirmar todas: ${err.message}`
          : 'Falha ao confirmar todas as transações.',
      );
    } finally {
      setConfirmingAll(false);
    }
  }

  function toggleBlock(key: string) {
    setActiveBlock((current) => (current === key ? null : key));
    setSelected(new Set());
    setBulkEditOpen(false);
  }

  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll(items: TransactionRecord[]) {
    const allSelected = items.length > 0 && items.every((tx) => selected.has(tx.id));
    setSelected((prev) => {
      const next = new Set(prev);
      for (const tx of items) {
        if (allSelected) next.delete(tx.id);
        else next.add(tx.id);
      }
      return next;
    });
  }

  async function confirmSelected(items: TransactionRecord[]) {
    const targets = items.filter((tx) => selected.has(tx.id) && tx.status === 'PENDING');
    if (targets.length === 0) return;
    if (!window.confirm(`Confirmar ${targets.length} transação(ões) selecionada(s)?`)) return;
    setBulkBusy(true);
    setError(null);
    try {
      for (const tx of targets) {
        await apiFetch(`/api/v1/transactions/${tx.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ status: 'CONFIRMED' }),
        });
      }
      setSelected(new Set());
      await onReload();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Falha ao confirmar as transações selecionadas.',
      );
    } finally {
      setBulkBusy(false);
    }
  }

  async function applySuggestions(items: TransactionRecord[]) {
    const targets = items.filter(
      (tx) => selected.has(tx.id) && !tx.category && tx.suggestedCategory,
    );
    if (targets.length === 0) return;
    setBulkBusy(true);
    setError(null);
    try {
      for (const tx of targets) {
        await apiFetch(`/api/v1/transactions/${tx.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ categoryId: tx.suggestedCategory!.id }),
        });
      }
      setSelected(new Set());
      await onReload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao aplicar as sugestões.');
    } finally {
      setBulkBusy(false);
    }
  }

  async function deleteSelected(items: TransactionRecord[]) {
    const targets = items.filter((tx) => selected.has(tx.id));
    if (targets.length === 0) return;
    // remove() na API reverte o saldo das que já estavam CONFIRMED (ver
    // transactions.service.ts) — excluir uma confirmada por engano é seguro.
    const hasConfirmed = targets.some((tx) => tx.status === 'CONFIRMED');
    const question = hasConfirmed
      ? `Excluir ${targets.length} transação(ões) selecionada(s)? O saldo das contas afetadas será ajustado.`
      : `Excluir ${targets.length} transação(ões) selecionada(s)?`;
    if (!window.confirm(question)) return;
    setBulkBusy(true);
    setError(null);
    try {
      for (const tx of targets) {
        await apiFetch(`/api/v1/transactions/${tx.id}`, { method: 'DELETE' });
      }
      setSelected(new Set());
      await onReload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao excluir as transações selecionadas.');
    } finally {
      setBulkBusy(false);
    }
  }

  function openBulkEdit(items: TransactionRecord[]) {
    const targets = items.filter((tx) => selected.has(tx.id));
    if (targets.length === 1) {
      const tx = targets[0]!;
      setBulkEditForm({
        categoryId: tx.category?.id ?? CLEAR,
        paymentMethod: tx.paymentMethod ?? CLEAR,
        description: tx.description,
      });
    } else {
      setBulkEditForm({ categoryId: NO_CHANGE, paymentMethod: NO_CHANGE, description: '' });
    }
    setBulkEditOpen(true);
  }

  async function applyBulkEdit(items: TransactionRecord[]) {
    const targets = items.filter((tx) => selected.has(tx.id));
    if (targets.length === 0) return;
    const payload: Record<string, unknown> = {};
    if (bulkEditForm.categoryId !== NO_CHANGE) {
      payload.categoryId = bulkEditForm.categoryId === CLEAR ? null : bulkEditForm.categoryId;
    }
    if (bulkEditForm.paymentMethod !== NO_CHANGE) {
      payload.paymentMethod =
        bulkEditForm.paymentMethod === CLEAR ? null : bulkEditForm.paymentMethod;
    }
    if (targets.length === 1) {
      payload.description = bulkEditForm.description;
    }
    if (Object.keys(payload).length === 0) {
      setBulkEditOpen(false);
      return;
    }
    setBulkBusy(true);
    setError(null);
    try {
      for (const tx of targets) {
        await apiFetch(`/api/v1/transactions/${tx.id}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
      }
      setSelected(new Set());
      setBulkEditOpen(false);
      await onReload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao editar as transações selecionadas.');
    } finally {
      setBulkBusy(false);
    }
  }

  const pendingCount = filteredTransactions.filter((tx) => tx.status === 'PENDING').length;

  return (
    <section className="section">
      <div className="section-head">
        <h2>Transações do mês por forma de pagamento</h2>
        <div className="section-head-actions">
          {canManage && pendingCount > 0 ? (
            <Button
              type="button"
              variant="ghost"
              disabled={confirmingAll}
              onClick={() => void confirmAll()}
            >
              {confirmingAll ? 'Confirmando…' : `Confirmar todas (${pendingCount})`}
            </Button>
          ) : null}
          {members.length > 0 ? (
            <Select value={memberFilter} onChange={(e) => setMemberFilter(e.target.value)}>
              <option value="">Todos os membros</option>
              <option value={SHARED_FILTER}>Conjunta / Compartilhada</option>
              {members.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name}
                </option>
              ))}
            </Select>
          ) : null}
        </div>
      </div>
      {error ? <ErrorBox>{error}</ErrorBox> : null}
      {filteredTransactions.length === 0 ? (
        <Card>
          <p className="empty">Nenhuma transação neste mês.</p>
        </Card>
      ) : (
        methodGroups.map((group) => {
          const key = groupKey(group.method);
          const isActive = activeBlock === key;
          const selectedCount = isActive
            ? group.items.filter((tx) => selected.has(tx.id)).length
            : 0;
          const canConfirmSelected =
            isActive &&
            group.items.some((tx) => selected.has(tx.id) && tx.status === 'PENDING');
          const canApplySuggestions =
            isActive &&
            group.items.some((tx) => selected.has(tx.id) && !tx.category && tx.suggestedCategory);
          const allSelected =
            isActive && group.items.length > 0 && group.items.every((tx) => selected.has(tx.id));

          return (
            <Card className="method-block" key={key}>
              <div className="method-head">
                <h3>{paymentMethodLabel(group.method)}</h3>
                <Badge tone="neutral">
                  {group.items.length} transaç{group.items.length === 1 ? 'ão' : 'ões'}
                </Badge>
                {canManage ? (
                  <Button type="button" variant="ghost" onClick={() => toggleBlock(key)}>
                    {isActive ? 'Concluir edição' : 'Editar'}
                  </Button>
                ) : null}
              </div>
              {isActive ? (
                <div className="bulk-bar">
                  <label className="bulk-select-all">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={() => toggleSelectAll(group.items)}
                    />
                    Selecionar todas
                  </label>
                  <span className="muted">{selectedCount} selecionada(s)</span>
                  <div className="bulk-bar-actions">
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={bulkBusy || !canConfirmSelected}
                      onClick={() => void confirmSelected(group.items)}
                    >
                      Confirmar
                    </Button>
                    {canApplySuggestions ? (
                      <Button
                        type="button"
                        variant="ghost"
                        disabled={bulkBusy}
                        onClick={() => void applySuggestions(group.items)}
                      >
                        Aplicar sugestões
                      </Button>
                    ) : null}
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={bulkBusy || selectedCount === 0}
                      onClick={() => openBulkEdit(group.items)}
                    >
                      Editar
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={bulkBusy || selectedCount === 0}
                      onClick={() => void deleteSelected(group.items)}
                    >
                      Excluir
                    </Button>
                  </div>
                </div>
              ) : null}
              {isActive && bulkEditOpen ? (
                <div className="inline-edit">
                  {selectedCount === 1 ? (
                    <Field label="Descrição">
                      <Input
                        value={bulkEditForm.description}
                        maxLength={300}
                        onChange={(e) =>
                          setBulkEditForm((prev) => ({ ...prev, description: e.target.value }))
                        }
                      />
                    </Field>
                  ) : null}
                  <Field label="Categoria">
                    <Select
                      value={bulkEditForm.categoryId}
                      onChange={(e) =>
                        setBulkEditForm((prev) => ({ ...prev, categoryId: e.target.value }))
                      }
                    >
                      {selectedCount > 1 ? <option value={NO_CHANGE}>Não alterar</option> : null}
                      <option value={CLEAR}>Sem categoria</option>
                      {orderedCategories.map((category) => (
                        <option key={category.id} value={category.id}>
                          {category.parentId ? `— ${category.name}` : category.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Forma de pagamento">
                    <Select
                      value={bulkEditForm.paymentMethod}
                      onChange={(e) =>
                        setBulkEditForm((prev) => ({ ...prev, paymentMethod: e.target.value }))
                      }
                    >
                      {selectedCount > 1 ? <option value={NO_CHANGE}>Não alterar</option> : null}
                      <option value={CLEAR}>Sem método</option>
                      {PAYMENT_METHODS.map((method) => (
                        <option key={method} value={method}>
                          {paymentMethodLabel(method)}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <div className="inline-edit-actions">
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={bulkBusy}
                      onClick={() => setBulkEditOpen(false)}
                    >
                      Cancelar
                    </Button>
                    <Button
                      type="button"
                      disabled={bulkBusy}
                      onClick={() => void applyBulkEdit(group.items)}
                    >
                      {bulkBusy ? 'Salvando…' : 'Aplicar'}
                    </Button>
                  </div>
                </div>
              ) : null}
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      {isActive ? <th aria-label="Selecionar" /> : null}
                      <th>Data</th>
                      <th>Descrição</th>
                      <th>Categoria</th>
                      <th>Forma de pagamento</th>
                      <th>Conta</th>
                      <th>Membro</th>
                      <th>Status</th>
                      <th className="td-num">Valor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.items.map((tx) => {
                      const positive = tx.type === 'INCOME';
                      return (
                        <tr key={tx.id}>
                          {isActive ? (
                            <td>
                              <input
                                type="checkbox"
                                checked={selected.has(tx.id)}
                                onChange={() => toggleSelected(tx.id)}
                              />
                            </td>
                          ) : null}
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
                          <td className="muted">{paymentMethodLabel(tx.paymentMethod)}</td>
                          <td className="muted">{tx.account?.name ?? '—'}</td>
                          <td>
                            {tx.member ? (
                              <Badge tone="neutral">{tx.member.name}</Badge>
                            ) : (
                              <span className="muted">Conjunta</span>
                            )}
                          </td>
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
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          );
        })
      )}
    </section>
  );
}
