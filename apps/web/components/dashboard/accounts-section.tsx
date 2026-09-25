'use client';

import { useState } from 'react';
import { apiFetch, type AccountRecord } from '@/lib/api';
import { accountTypeLabel, brl } from '@/lib/format';
import { Button, Card, ErrorBox, Field, Input } from '@/components/ui';
import { AccountForm } from '@/components/account-form';
import { InvoiceView } from '@/components/invoice-view';

type Props = {
  accounts: AccountRecord[];
  canManage: boolean;
  onReload: () => Promise<void>;
};

// Não existe um campo de saldo editável na conta — o saldo é sempre derivado
// da soma das transações confirmadas (ver balanceDelta() na API). Para
// reconciliar com o banco de verdade (ex.: depois de importar um extrato que
// não cobre todo o histórico), este formulário lança uma transação de ajuste
// confirmada pela diferença, em vez de escrever direto no saldo.
function BalanceAdjustForm({
  account,
  onCancel,
  onDone,
}: {
  account: AccountRecord;
  onCancel: () => void;
  onDone: () => Promise<void>;
}) {
  const [value, setValue] = useState(account.balance);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit() {
    setError(null);
    const target = Number(value.replace(',', '.'));
    if (Number.isNaN(target)) {
      setError('Informe um valor numérico válido.');
      return;
    }
    const delta = target - Number(account.balance);
    if (delta === 0) {
      onCancel();
      return;
    }
    setSubmitting(true);
    try {
      await apiFetch('/api/v1/transactions', {
        method: 'POST',
        body: JSON.stringify({
          description: 'Ajuste de saldo',
          amount: Math.abs(delta),
          type: delta >= 0 ? 'INCOME' : 'EXPENSE',
          status: 'CONFIRMED',
          accountId: account.id,
          date: new Date().toISOString(),
        }),
      });
      await onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao ajustar o saldo.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card className="form-card">
      <h3 className="form-title">Ajustar saldo de &quot;{account.name}&quot;</h3>
      <div className="form-grid">
        <Field label="Saldo correto (R$)" hint="Lança uma transação de ajuste pela diferença">
          <Input
            type="number"
            step="0.01"
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
        </Field>
      </div>
      {error ? <ErrorBox>{error}</ErrorBox> : null}
      <div className="form-actions">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={submitting}>
          Cancelar
        </Button>
        <Button type="button" onClick={() => void onSubmit()} disabled={submitting}>
          {submitting ? 'Salvando…' : 'Ajustar'}
        </Button>
      </div>
    </Card>
  );
}

export function AccountsSection({ accounts, canManage, onReload }: Props) {
  const [showAccountForm, setShowAccountForm] = useState(false);
  const [editingAccount, setEditingAccount] = useState<AccountRecord | null>(null);
  const [invoiceAccount, setInvoiceAccount] = useState<AccountRecord | null>(null);
  const [adjustingAccount, setAdjustingAccount] = useState<AccountRecord | null>(null);

  return (
    <section className="section">
      <div className="section-head">
        <h2>Contas</h2>
        {canManage ? (
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              if (showAccountForm || editingAccount) {
                setShowAccountForm(false);
                setEditingAccount(null);
              } else {
                setShowAccountForm(true);
              }
            }}
          >
            {showAccountForm || editingAccount ? 'Fechar' : '+ Nova conta'}
          </Button>
        ) : null}
      </div>
      {editingAccount ? (
        <AccountForm
          key={editingAccount.id}
          account={editingAccount}
          onCancel={() => setEditingAccount(null)}
          onDone={async () => {
            setEditingAccount(null);
            setShowAccountForm(false);
            await onReload();
          }}
        />
      ) : showAccountForm ? (
        <AccountForm
          onCancel={() => setShowAccountForm(false)}
          onDone={async () => {
            setShowAccountForm(false);
            await onReload();
          }}
        />
      ) : null}
      {adjustingAccount ? (
        <BalanceAdjustForm
          key={adjustingAccount.id}
          account={adjustingAccount}
          onCancel={() => setAdjustingAccount(null)}
          onDone={async () => {
            setAdjustingAccount(null);
            await onReload();
          }}
        />
      ) : null}
      <Card>
        {accounts.length === 0 ? (
          <p className="empty">Nenhuma conta cadastrada ainda.</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Tipo</th>
                  <th>Instituição</th>
                  <th className="td-num">Saldo</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((account) => (
                  <tr key={account.id}>
                    <td>{account.name}</td>
                    <td>{accountTypeLabel(account.type)}</td>
                    <td className="muted">{account.institution ?? '—'}</td>
                    <td className="td-num">{brl(account.balance)}</td>
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
                      {canManage ? (
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
                      ) : null}
                      {canManage ? (
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={() =>
                            setAdjustingAccount((current) =>
                              current?.id === account.id ? null : account,
                            )
                          }
                        >
                          Ajustar saldo
                        </Button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {invoiceAccount ? (
        <InvoiceView account={invoiceAccount} onClose={() => setInvoiceAccount(null)} />
      ) : null}
    </section>
  );
}
