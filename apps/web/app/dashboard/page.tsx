'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import {
  apiFetch,
  type AccountRecord,
  type CashflowResponse,
  type TransactionRecord,
} from '@/lib/api';
import { accountTypeLabel, brl, formatDate, monthRange, statusLabel } from '@/lib/format';
import { Badge, Button, Card, ErrorBox, Spinner, StatCard } from '@/components/ui';

type DashboardData = {
  accounts: AccountRecord[];
  cashflow: CashflowResponse;
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

export default function DashboardPage() {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const range = monthRange();
    try {
      const [accounts, cashflow, transactions] = await Promise.all([
        apiFetch<AccountRecord[]>('/api/v1/accounts'),
        apiFetch<CashflowResponse>(`/api/v1/reports/cashflow?from=${range.from}&to=${range.to}`),
        apiFetch<TransactionRecord[]>('/api/v1/transactions'),
      ]);
      setData({ accounts, cashflow, transactions });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao carregar os dados.');
    }
  }, []);

  useEffect(() => {
    if (user) void load();
  }, [user, load]);

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [loading, user, router]);

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
  const recent = data?.transactions.slice(0, 8) ?? [];

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
          <Button type="button" variant="ghost" onClick={() => void load()}>
            Atualizar
          </Button>
        </div>

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
              <h2>Últimas transações</h2>
              <Card>
                {recent.length === 0 ? (
                  <p className="empty">Nenhuma transação registrada ainda.</p>
                ) : (
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
                      {recent.map((tx) => {
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
                )}
              </Card>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
