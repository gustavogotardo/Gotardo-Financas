'use client';

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import {
  apiFetch,
  type AccountRecord,
  type AccountStatement,
  type AnomalyRow,
  type CashflowResponse,
  type CategoryExpenseRow,
  type CategoryRecord,
  type EnvelopeExpenseRow,
  type EnvelopeRecord,
  type ImportRecord,
  type PaymentMethodRow,
  type TransactionRecord,
} from '@/lib/api';
import {
  accountTypeLabel,
  brl,
  formatDate,
  monthRange,
  paymentMethodLabel,
  statusLabel,
} from '@/lib/format';
import { Badge, Button, Card, ErrorBox, Select, Spinner, StatCard } from '@/components/ui';
import { AccountForm } from '@/components/account-form';
import { AllocationForm } from '@/components/allocation-form';
import { CategoryForm } from '@/components/category-form';
import { EnvelopeForm } from '@/components/envelope-form';
import { ImportForm, ImportRow } from '@/components/import-form';
import { InvoiceView } from '@/components/invoice-view';
import { TransactionForm } from '@/components/transaction-form';

const MONTH_FORMAT = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' });

type DashboardData = {
  accounts: AccountRecord[];
  categories: CategoryRecord[];
  envelopes: EnvelopeRecord[];
  imports: ImportRecord[];
  cashflow: CashflowResponse;
  paymentMethods: PaymentMethodRow[];
  expensesByCategory: CategoryExpenseRow[];
  expensesByEnvelope: EnvelopeExpenseRow[];
  accountStatement: AccountStatement | null;
  anomalies: AnomalyRow[];
  transactions: TransactionRecord[];
};

function statusTone(status: string): string {
  switch (status) {
    case 'CONFIRMED':
      return 'success';
    case 'REJECTED':
      return 'danger';
    case 'PENDING':
      return 'warning';
    default:
      return 'info';
  }
}

function shiftMonth(month: Date, delta: number): Date {
  return new Date(month.getFullYear(), month.getMonth() + delta, 1);
}

function monthLabel(month: Date): string {
  const label = MONTH_FORMAT.format(month);
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function inRange(txDate: string, from: Date, to: Date): boolean {
  const date = new Date(txDate);
  return date >= from && date <= to;
}

export default function DashboardPage() {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const [month, setMonth] = useState(() => new Date());
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [showAccountForm, setShowAccountForm] = useState(false);
  const [showCategoryForm, setShowCategoryForm] = useState(false);
  const [editingAccount, setEditingAccount] = useState<AccountRecord | null>(null);
  const [editingCategory, setEditingCategory] = useState<CategoryRecord | null>(null);
  const [showEnvelopeForm, setShowEnvelopeForm] = useState(false);
  const [editingEnvelope, setEditingEnvelope] = useState<EnvelopeRecord | null>(null);
  const [allocatingEnvelope, setAllocatingEnvelope] = useState<EnvelopeRecord | null>(null);
  const [showImportForm, setShowImportForm] = useState(false);
  const [invoiceAccount, setInvoiceAccount] = useState<AccountRecord | null>(null);
  const [statementAccountId, setStatementAccountId] = useState<string>('');
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [applyingId, setApplyingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const range = monthRange(month);
    try {
      const accounts = await apiFetch<AccountRecord[]>('/api/v1/accounts');
      const accountId = statementAccountId || accounts[0]?.id || '';
      const [
        categories,
        envelopes,
        imports,
        cashflow,
        paymentMethods,
        expensesByCategory,
        expensesByEnvelope,
        anomalies,
        accountStatement,
        transactions,
      ] = await Promise.all([
        apiFetch<CategoryRecord[]>('/api/v1/categories'),
        apiFetch<EnvelopeRecord[]>('/api/v1/envelopes'),
        apiFetch<ImportRecord[]>('/api/v1/imports'),
        apiFetch<CashflowResponse>(`/api/v1/reports/cashflow?from=${range.from}&to=${range.to}`),
        apiFetch<PaymentMethodRow[]>(
          `/api/v1/reports/payment-methods?from=${range.from}&to=${range.to}`,
        ),
        apiFetch<CategoryExpenseRow[]>(
          `/api/v1/reports/expenses-by-category?from=${range.from}&to=${range.to}`,
        ),
        apiFetch<EnvelopeExpenseRow[]>(
          `/api/v1/reports/expenses-by-envelope?from=${range.from}&to=${range.to}`,
        ),
        apiFetch<AnomalyRow[]>(`/api/v1/reports/anomalies?from=${range.from}&to=${range.to}`),
        accountId
          ? apiFetch<AccountStatement>(
              `/api/v1/reports/account-statement/${accountId}?from=${range.from}&to=${range.to}`,
            )
          : Promise.resolve(null),
        apiFetch<TransactionRecord[]>('/api/v1/transactions'),
      ]);
      setData({
        accounts,
        categories,
        envelopes,
        imports,
        cashflow,
        paymentMethods,
        expensesByCategory,
        expensesByEnvelope,
        accountStatement,
        anomalies,
        transactions,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao carregar os dados.');
    }
  }, [month, statementAccountId]);

  useEffect(() => {
    if (user) void load();
  }, [user, load]);

  useEffect(() => {
    if (!statementAccountId && data && data.accounts.length > 0) {
      setStatementAccountId(data.accounts[0]?.id ?? '');
    }
  }, [data, statementAccountId]);

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [loading, user, router]);

  const range = monthRange(month);
  const rangeStart = useMemo(() => new Date(`${range.from}T00:00:00`), [range.from]);
  const rangeEnd = useMemo(() => new Date(`${range.to}T23:59:59.999`), [range.to]);

  const anomalyById = useMemo(() => {
    const map = new Map<string, AnomalyRow>();
    for (const row of data?.anomalies ?? []) {
      if (row.isAnomaly) map.set(row.transactionId, row);
    }
    return map;
  }, [data]);

  const monthTransactions = useMemo(
    () => (data?.transactions ?? []).filter((tx) => inRange(tx.date, rangeStart, rangeEnd)),
    [data, rangeStart, rangeEnd],
  );

  const methodGroups = useMemo(() => {
    const expenseByMethod = new Map(
      (data?.paymentMethods ?? []).map((row) => [row.method ?? '__none__', Number(row.expense)]),
    );
    const map = new Map<string | null, TransactionRecord[]>();
    for (const tx of monthTransactions) {
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
  }, [monthTransactions, data]);

  if (loading || !user) {
    return (
      <div className="auth-wrap">
        <Spinner />
      </div>
    );
  }

  const totalBalance =
    data?.accounts.reduce((acc, account) => acc + Number(account.balance), 0) ?? 0;
  const income = data ? Number(data.cashflow.income) : 0;
  const expense = data ? Number(data.cashflow.expense) : 0;
  const net = income - expense;

  async function handleLogout() {
    await logout();
    router.replace('/login');
  }

  async function confirmTransaction(id: string) {
    setConfirmingId(id);
    setError(null);
    try {
      await apiFetch(`/api/v1/transactions/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'CONFIRMED' }),
      });
      await load();
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
      await load();
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
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao aplicar a sugestão.');
    } finally {
      setApplyingId(null);
    }
  }

  const canManage = user.role === 'OWNER' || user.role === 'ADMIN';

  const groupedCategories = useMemo(() => {
    const parents = (data?.categories ?? [])
      .filter((category) => !category.parentId)
      .sort((a, b) => a.name.localeCompare(b.name));
    const childrenByParent = new Map<string, CategoryRecord[]>();
    for (const category of data?.categories ?? []) {
      if (!category.parentId) continue;
      const list = childrenByParent.get(category.parentId);
      if (list) list.push(category);
      else childrenByParent.set(category.parentId, [category]);
    }
    for (const list of childrenByParent.values()) {
      list.sort((a, b) => a.name.localeCompare(b.name));
    }
    const orphanChildren = (data?.categories ?? []).filter(
      (category) => category.parentId && !childrenByParent.has(category.parentId),
    );
    return { parents, childrenByParent, orphanChildren };
  }, [data]);

  return (
    <div>
      <header className="topbar">
        <div className="container topbar-inner">
          <span className="brand">Gotardo Finanças</span>
          <div className="topbar-user">
            <span>
              {user.family.name} · {user.name}
            </span>
            <Button type="button" variant="ghost" onClick={() => router.push('/familia')}>
              Família
            </Button>
            <Button type="button" variant="ghost" onClick={() => void handleLogout()}>
              Sair
            </Button>
          </div>
        </div>
      </header>

      <main className="container">
        <div className="page-head">
          <h1>Dashboard</h1>
          <div className="month-nav">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setMonth((m) => shiftMonth(m, -1))}
            >
              ‹
            </Button>
            <span className="month-label">{monthLabel(month)}</span>
            <Button type="button" variant="ghost" onClick={() => setMonth((m) => shiftMonth(m, 1))}>
              ›
            </Button>
            <Button type="button" variant="ghost" onClick={() => void load()}>
              Atualizar
            </Button>
            {canManage ? (
              <Button type="button" onClick={() => setShowForm((show) => !show)}>
                {showForm ? 'Fechar' : 'Nova transação'}
              </Button>
            ) : null}
          </div>
        </div>

        {showForm && data ? (
          <TransactionForm
            accounts={data.accounts}
            categories={data.categories}
            onCancel={() => setShowForm(false)}
            onCreated={async () => {
              setShowForm(false);
              await load();
            }}
          />
        ) : null}

        {error ? <ErrorBox>{error}</ErrorBox> : null}

        {!data ? (
          <Spinner />
        ) : (
          <>
            <div className="stat-grid">
              <StatCard label="Saldo total" value={brl(totalBalance)} />
              <StatCard label="Receitas do mês" value={brl(income)} tone="success" />
              <StatCard label="Despesas do mês" value={brl(expense)} tone="danger" />
              <StatCard
                label="Resultado do mês"
                value={brl(net)}
                tone={net >= 0 ? 'success' : 'danger'}
              />
            </div>

            <section className="section">
              <div className="section-head">
                <h2>Contas</h2>
                {canManage ? (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      setEditingAccount(null);
                      setShowAccountForm((show) => !show);
                    }}
                  >
                    {showAccountForm || editingAccount ? 'Fechar' : '+ Nova conta'}
                  </Button>
                ) : null}
              </div>
              {editingAccount ? (
                <AccountForm
                  account={editingAccount}
                  onCancel={() => setEditingAccount(null)}
                  onDone={async () => {
                    setEditingAccount(null);
                    setShowAccountForm(false);
                    await load();
                  }}
                />
              ) : showAccountForm ? (
                <AccountForm
                  onCancel={() => setShowAccountForm(false)}
                  onDone={async () => {
                    setShowAccountForm(false);
                    await load();
                  }}
                />
              ) : null}
              <Card>
                {data.accounts.length === 0 ? (
                  <p className="empty">Nenhuma conta cadastrada ainda.</p>
                ) : (
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Nome</th>
                        <th>Tipo</th>
                        <th>Instituição</th>
                        <th className="td-num">Saldo</th>
                        {canManage ? <th>Ações</th> : null}
                      </tr>
                    </thead>
                    <tbody>
                      {data.accounts.map((account) => (
                        <tr key={account.id}>
                          <td>{account.name}</td>
                          <td>{accountTypeLabel(account.type)}</td>
                          <td className="muted">{account.institution ?? '—'}</td>
                          <td className="td-num">{brl(account.balance)}</td>
                          {canManage ? (
                            <td>
                              {account.type === 'CREDIT_CARD' ? (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  onClick={() =>
                                    setInvoiceAccount((current) =>
                                      current?.id === account.id ? null : account,
                                    )
                                  }
                                >
                                  {invoiceAccount?.id === account.id ? 'Fechar fatura' : 'Ver fatura'}
                                </Button>
                              ) : null}
                              <Button
                                type="button"
                                variant="ghost"
                                onClick={() => {
                                  setShowAccountForm(false);
                                  setEditingAccount(account);
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
                )}
              </Card>
              {invoiceAccount ? (
                <InvoiceView account={invoiceAccount} onClose={() => setInvoiceAccount(null)} />
              ) : null}
            </section>

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
                  categories={data.categories}
                  onCancel={() => setEditingCategory(null)}
                  onDone={async () => {
                    setEditingCategory(null);
                    setShowCategoryForm(false);
                    await load();
                  }}
                />
              ) : showCategoryForm ? (
                <CategoryForm
                  categories={data.categories}
                  onCancel={() => setShowCategoryForm(false)}
                  onDone={async () => {
                    setShowCategoryForm(false);
                    await load();
                  }}
                />
              ) : null}
              <Card>
                {data.categories.length === 0 ? (
                  <p className="empty">Nenhuma categoria cadastrada ainda.</p>
                ) : (
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
                )}
              </Card>
            </section>

            <section className="section">
              <div className="section-head">
                <h2>Envelopes</h2>
                {canManage ? (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      setEditingEnvelope(null);
                      setShowEnvelopeForm((show) => !show);
                    }}
                  >
                    {showEnvelopeForm || editingEnvelope ? 'Fechar' : '+ Novo envelope'}
                  </Button>
                ) : null}
              </div>
              {editingEnvelope ? (
                <EnvelopeForm
                  envelope={editingEnvelope}
                  onCancel={() => setEditingEnvelope(null)}
                  onDone={async () => {
                    setEditingEnvelope(null);
                    setShowEnvelopeForm(false);
                    await load();
                  }}
                />
              ) : showEnvelopeForm ? (
                <EnvelopeForm
                  onCancel={() => setShowEnvelopeForm(false)}
                  onDone={async () => {
                    setShowEnvelopeForm(false);
                    await load();
                  }}
                />
              ) : null}
              {allocatingEnvelope ? (
                <AllocationForm
                  envelope={allocatingEnvelope}
                  onCancel={() => setAllocatingEnvelope(null)}
                  onDone={async () => {
                    setAllocatingEnvelope(null);
                    await load();
                  }}
                />
              ) : null}
              <Card>
                {data.envelopes.length === 0 ? (
                  <p className="empty">Nenhum envelope cadastrado ainda.</p>
                ) : (
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
                      {data.envelopes.map((envelope) => {
                        const target = Number(envelope.targetAmount ?? 0);
                        const allocated = Number(envelope.allocated);
                        const progress = target > 0 ? Math.min(100, (allocated / target) * 100) : 0;
                        return (
                          <tr key={envelope.id}>
                            <td>
                              <span className="envelope-name">
                                {envelope.icon ? (
                                  <span className="muted">{envelope.icon}</span>
                                ) : null}{' '}
                                {envelope.name}
                              </span>
                              {target > 0 ? (
                                <span
                                  className="progress"
                                  title={`${progress.toFixed(0)}% da meta`}
                                >
                                  <span
                                    className="progress-fill"
                                    style={{ width: `${progress}%` }}
                                  />
                                </span>
                              ) : null}
                            </td>
                            <td className="td-num">{target > 0 ? brl(target) : '—'}</td>
                            <td className="td-num">{brl(envelope.allocated)}</td>
                            <td className="td-num td-neg">{brl(envelope.spent)}</td>
                            <td
                              className={`td-num ${
                                Number(envelope.balance) < 0 ? 'td-neg' : 'td-pos'
                              }`}
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
                )}
              </Card>
            </section>

            <section className="section">
              <div className="section-head">
                <h2>Importar extratos</h2>
                {canManage ? (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setShowImportForm((show) => !show)}
                  >
                    {showImportForm ? 'Fechar' : '+ Importar extrato'}
                  </Button>
                ) : null}
              </div>
              {showImportForm && data ? (
                <ImportForm
                  accounts={data.accounts}
                  onCancel={() => setShowImportForm(false)}
                  onDone={async () => {
                    setShowImportForm(false);
                    await load();
                  }}
                />
              ) : null}
              <Card>
                {data.imports.length === 0 ? (
                  <p className="empty">Nenhuma importação ainda.</p>
                ) : (
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Arquivo</th>
                        <th>Data</th>
                        <th className="td-num">Tamanho</th>
                        <th className="td-num">Transações</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.imports.map((imported) => (
                        <ImportRow key={imported.id} imported={imported} />
                      ))}
                    </tbody>
                  </table>
                )}
              </Card>
            </section>

            <section className="section">
              <h2>Formas de pagamento</h2>
              {data.paymentMethods.length === 0 ? (
                <Card>
                  <p className="empty">Nenhuma transação confirmada neste mês.</p>
                </Card>
              ) : (
                <div className="stat-grid">
                  {data.paymentMethods.map((row) => (
                    <StatCard
                      key={row.method ?? 'none'}
                      label={row.label}
                      value={brl(row.expense)}
                      tone="danger"
                    />
                  ))}
                </div>
              )}
            </section>

            <section className="section">
              <div className="section-head">
                <h2>Gastos por categoria</h2>
              </div>
              <Card>
                {data.expensesByCategory.length === 0 ? (
                  <p className="empty">Nenhum gasto confirmado neste mês.</p>
                ) : (
                  <div className="report-bars">
                    {data.expensesByCategory.map((row) => (
                      <div className="report-bar" key={row.categoryId ?? 'none'}>
                        <span className="report-bar-label">{row.categoryName}</span>
                        <div className="progress">
                          <span
                            className="progress-fill progress-fill-danger"
                            style={{
                              width: `${(Number(row.total) / Number(data.expensesByCategory[0]?.total ?? 1)) * 100}%`,
                            }}
                          />
                        </div>
                        <span className="report-bar-value">{brl(row.total)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </section>

            <section className="section">
              <div className="section-head">
                <h2>Gastos por envelope</h2>
              </div>
              <Card>
                {data.expensesByEnvelope.length === 0 ? (
                  <p className="empty">Nenhum gasto em envelopes neste mês.</p>
                ) : (
                  <div className="report-bars">
                    {data.expensesByEnvelope.map((row) => (
                      <div className="report-bar" key={row.envelopeId ?? 'none'}>
                        <span className="report-bar-label">{row.envelopeName}</span>
                        <div className="progress">
                          <span
                            className="progress-fill progress-fill-danger"
                            style={{
                              width: `${(Number(row.total) / Number(data.expensesByEnvelope[0]?.total ?? 1)) * 100}%`,
                            }}
                          />
                        </div>
                        <span className="report-bar-value">{brl(row.total)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </section>

            <section className="section">
              <div className="section-head">
                <h2>Extrato por conta</h2>
                {data.accounts.length > 1 ? (
                  <Select
                    value={statementAccountId}
                    onChange={(e) => setStatementAccountId(e.target.value)}
                  >
                    {data.accounts.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.name}
                      </option>
                    ))}
                  </Select>
                ) : null}
              </div>
              {data.accountStatement ? (
                <Card>
                  <div className="stat-grid">
                    <StatCard
                      label="Saldo inicial"
                      value={brl(data.accountStatement.openingBalance)}
                    />
                    <StatCard
                      label="Entradas"
                      value={brl(data.accountStatement.income)}
                      tone="success"
                    />
                    <StatCard
                      label="Saídas"
                      value={brl(data.accountStatement.expense)}
                      tone="danger"
                    />
                    <StatCard
                      label="Saldo final"
                      value={brl(data.accountStatement.closingBalance)}
                      tone={
                        Number(data.accountStatement.closingBalance) >= 0 ? 'success' : 'danger'
                      }
                    />
                  </div>
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Data</th>
                        <th>Descrição</th>
                        <th>Categoria</th>
                        <th>Status</th>
                        <th className="td-num">Valor</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.accountStatement.transactions.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="muted">
                            Nenhuma transação confirmada neste período.
                          </td>
                        </tr>
                      ) : (
                        data.accountStatement.transactions.map((tx) => {
                          const positive = tx.type === 'INCOME';
                          return (
                            <tr key={tx.id}>
                              <td>{formatDate(tx.date)}</td>
                              <td>{tx.description}</td>
                              <td>{tx.category?.name ?? '—'}</td>
                              <td>
                                <Badge tone={statusTone(tx.status)}>{statusLabel(tx.status)}</Badge>
                              </td>
                              <td className={`td-num ${positive ? 'td-pos' : 'td-neg'}`}>
                                {positive ? '+' : '−'}
                                {brl(tx.amount)}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </Card>
              ) : null}
            </section>

            <section className="section">
              <h2>Transações do mês por forma de pagamento</h2>
              {monthTransactions.length === 0 ? (
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
                  </Card>
                ))
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}
