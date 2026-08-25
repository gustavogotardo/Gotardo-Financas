'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { useDashboardData } from '@/lib/use-dashboard-data';
import { brl, monthRange } from '@/lib/format';
import { Button, Card, ErrorBox, Spinner, StatCard } from '@/components/ui';
import { TransactionForm } from '@/components/transaction-form';
import { AccountsSection } from '@/components/dashboard/accounts-section';
import { AccountStatementSection } from '@/components/dashboard/account-statement-section';
import { CashflowChart } from '@/components/dashboard/cashflow-chart';
import { CategoriesSection } from '@/components/dashboard/categories-section';
import { CategoryChart } from '@/components/dashboard/category-chart';
import { EnvelopesSection } from '@/components/dashboard/envelopes-section';
import { ImportsSection } from '@/components/dashboard/imports-section';
import { TransactionsSection } from '@/components/dashboard/transactions-section';
import { NotificationBell } from '@/components/notification-bell';

const MONTH_FORMAT = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' });

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
  const [showForm, setShowForm] = useState(false);
  const [statementAccountId, setStatementAccountId] = useState<string>('');

  const { data, error, reload, version } = useDashboardData(
    month,
    statementAccountId,
    Boolean(user),
  );

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

  const monthTransactions = useMemo(
    () => (data?.transactions ?? []).filter((tx) => inRange(tx.date, rangeStart, rangeEnd)),
    [data, rangeStart, rangeEnd],
  );

  const pendingCount = useMemo(
    () => monthTransactions.filter((tx) => tx.status === 'PENDING').length,
    [monthTransactions],
  );

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
  const savingsRate = income > 0 ? ((income - expense) / income) * 100 : expense > 0 ? -100 : 0;

  async function handleLogout() {
    await logout();
    router.replace('/login');
  }

  const canManage = user.role === 'OWNER' || user.role === 'ADMIN';

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
            <Button type="button" variant="ghost" onClick={() => router.push('/metas')}>
              Metas
            </Button>
            <NotificationBell />
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
            <Button type="button" variant="ghost" onClick={() => void reload()}>
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
              await reload();
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
              <StatCard
                label="Taxa de economia"
                value={`${savingsRate.toFixed(0)}%`}
                tone={savingsRate >= 0 ? 'success' : 'danger'}
              />
              <StatCard
                label="Transações pendentes"
                value={String(pendingCount)}
                tone={pendingCount > 0 ? 'warning' : 'neutral'}
              />
            </div>

            <CashflowChart refreshToken={version} />

            <AccountsSection accounts={data.accounts} canManage={canManage} onReload={reload} />

            <CategoriesSection
              categories={data.categories}
              canManage={canManage}
              onReload={reload}
            />

            <EnvelopesSection envelopes={data.envelopes} canManage={canManage} onReload={reload} />

            <ImportsSection
              accounts={data.accounts}
              imports={data.imports}
              canManage={canManage}
              onReload={reload}
            />

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

            <CategoryChart expensesByCategory={data.expensesByCategory} />

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

            <AccountStatementSection
              accounts={data.accounts}
              accountStatement={data.accountStatement}
              statementAccountId={statementAccountId}
              onStatementAccountChange={setStatementAccountId}
            />

            <TransactionsSection
              transactions={monthTransactions}
              paymentMethods={data.paymentMethods}
              anomalies={data.anomalies}
              canManage={canManage}
              onReload={reload}
            />
          </>
        )}
      </main>
    </div>
  );
}
