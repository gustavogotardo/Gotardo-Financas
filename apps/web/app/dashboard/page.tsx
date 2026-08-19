'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import {
  apiFetch,
  type AccountRecord,
  type CashflowResponse,
  type CategoryRecord,
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
import { Badge, Button, Card, ErrorBox, Spinner, StatCard } from '@/components/ui';
import { TransactionForm } from '@/components/transaction-form';

const MONTH_FORMAT = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' });

type DashboardData = {
  accounts: AccountRecord[];
  categories: CategoryRecord[];
  cashflow: CashflowResponse;
  paymentMethods: PaymentMethodRow[];
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

  const load = useCallback(async () => {
    setError(null);
    const range = monthRange(month);
    try {
      const [accounts, categories, cashflow, paymentMethods, transactions] = await Promise.all([
        apiFetch<AccountRecord[]>('/api/v1/accounts'),
        apiFetch<CategoryRecord[]>('/api/v1/categories'),
        apiFetch<CashflowResponse>(`/api/v1/reports/cashflow?from=${range.from}&to=${range.to}`),
        apiFetch<PaymentMethodRow[]>(
          `/api/v1/reports/payment-methods?from=${range.from}&to=${range.to}`,
        ),
        apiFetch<TransactionRecord[]>('/api/v1/transactions'),
      ]);
      setData({ accounts, categories, cashflow, paymentMethods, transactions });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao carregar os dados.');
    }
  }, [month]);

  useEffect(() => {
    if (user) void load();
  }, [user, load]);

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [loading, user, router]);

  const range = monthRange(month);
  const rangeStart = useMemo(() => new Date(`${range.from}T00:00:00`), [range.from]);
  const rangeEnd = useMemo(() => new Date(`${range.to}T23:59:59.999`), [range.to]);

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

  return (
    <div>
      <header className="topbar">
        <div className="container topbar-inner">
          <span className="brand">Gotardo Finanças</span>
          <div className="topbar-user">
            <span>
              {user.family.name} · {user.name}
            </span>
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
            {user.role === 'OWNER' || user.role === 'ADMIN' ? (
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
              <h2>Contas</h2>
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
                      </tr>
                    </thead>
                    <tbody>
                      {data.accounts.map((account) => (
                        <tr key={account.id}>
                          <td>{account.name}</td>
                          <td>{accountTypeLabel(account.type)}</td>
                          <td className="muted">{account.institution ?? '—'}</td>
                          <td className="td-num">{brl(account.balance)}</td>
                        </tr>
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
                        </tr>
                      </thead>
                      <tbody>
                        {group.items.map((tx) => {
                          const positive = tx.type === 'INCOME';
                          return (
                            <tr key={tx.id}>
                              <td>{formatDate(tx.date)}</td>
                              <td>{tx.description}</td>
                              <td>{tx.category?.name ?? '—'}</td>
                              <td className="muted">{tx.account?.name ?? '—'}</td>
                              <td>
                                <Badge tone={statusTone(tx.status)}>{statusLabel(tx.status)}</Badge>
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
