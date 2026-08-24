'use client';

import type { AccountRecord, AccountStatement } from '@/lib/api';
import { brl, formatDate, statusLabel } from '@/lib/format';
import { Badge, Card, Select, StatCard } from '@/components/ui';

type Props = {
  accounts: AccountRecord[];
  accountStatement: AccountStatement | null;
  statementAccountId: string;
  onStatementAccountChange: (accountId: string) => void;
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

export function AccountStatementSection({
  accounts,
  accountStatement,
  statementAccountId,
  onStatementAccountChange,
}: Props) {
  return (
    <section className="section">
      <div className="section-head">
        <h2>Extrato por conta</h2>
        {accounts.length > 1 ? (
          <Select
            value={statementAccountId}
            onChange={(e) => onStatementAccountChange(e.target.value)}
          >
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </Select>
        ) : null}
      </div>
      {accountStatement ? (
        <Card>
          <div className="stat-grid">
            <StatCard label="Saldo inicial" value={brl(accountStatement.openingBalance)} />
            <StatCard label="Entradas" value={brl(accountStatement.income)} tone="success" />
            <StatCard label="Saídas" value={brl(accountStatement.expense)} tone="danger" />
            <StatCard
              label="Saldo final"
              value={brl(accountStatement.closingBalance)}
              tone={Number(accountStatement.closingBalance) >= 0 ? 'success' : 'danger'}
            />
          </div>
          <div className="table-wrap">
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
                {accountStatement.transactions.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="muted">
                      Nenhuma transação confirmada neste período.
                    </td>
                  </tr>
                ) : (
                  accountStatement.transactions.map((tx) => {
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
          </div>
        </Card>
      ) : null}
    </section>
  );
}
