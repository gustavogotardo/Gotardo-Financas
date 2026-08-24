'use client';

import { useState } from 'react';
import type { AccountRecord } from '@/lib/api';
import { accountTypeLabel, brl } from '@/lib/format';
import { Button, Card } from '@/components/ui';
import { AccountForm } from '@/components/account-form';
import { InvoiceView } from '@/components/invoice-view';

type Props = {
  accounts: AccountRecord[];
  canManage: boolean;
  onReload: () => Promise<void>;
};

export function AccountsSection({ accounts, canManage, onReload }: Props) {
  const [showAccountForm, setShowAccountForm] = useState(false);
  const [editingAccount, setEditingAccount] = useState<AccountRecord | null>(null);
  const [invoiceAccount, setInvoiceAccount] = useState<AccountRecord | null>(null);

  return (
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
