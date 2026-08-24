'use client';

import { useEffect, useState } from 'react';
import { getAccountInvoice, type AccountInvoice, type AccountRecord } from '@/lib/api';
import { brl, formatDate } from '@/lib/format';
import { Button, Card, ErrorBox, Spinner } from './ui';

type Props = {
  account: AccountRecord;
  onClose: () => void;
};

export function InvoiceView({ account, onClose }: Props) {
  const [invoice, setInvoice] = useState<AccountInvoice | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getAccountInvoice(account.id)
      .then((result) => {
        if (!cancelled) setInvoice(result);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Falha ao carregar a fatura.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [account.id]);

  return (
    <Card className="form-card">
      <div className="section-head">
        <h3 className="form-title">Fatura · {account.name}</h3>
        <Button type="button" variant="ghost" onClick={onClose}>
          Fechar
        </Button>
      </div>
      {loading ? <Spinner /> : null}
      {error ? <ErrorBox>{error}</ErrorBox> : null}
      {!loading && invoice ? (
        <>
          <div className="stat-grid">
            <div className="stat">
              <span className="stat-label">Período</span>
              <span className="stat-value">{invoice.period}</span>
            </div>
            <div className="stat">
              <span className="stat-label">Fechamento</span>
              <span className="stat-value">{formatDate(invoice.closingDate)}</span>
            </div>
            <div className="stat">
              <span className="stat-label">Vencimento</span>
              <span className="stat-value">{formatDate(invoice.dueDate)}</span>
            </div>
            <div className="stat">
              <span className="stat-label">Total</span>
              <span className="stat-value">{brl(invoice.total)}</span>
            </div>
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Descrição</th>
                  <th>Parcela</th>
                  <th className="td-num">Valor</th>
                </tr>
              </thead>
              <tbody>
                {invoice.transactions.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="muted">
                      Nenhuma transação nesta fatura.
                    </td>
                  </tr>
                ) : (
                  invoice.transactions.map((tx) => (
                    <tr key={tx.id}>
                      <td>{formatDate(tx.date)}</td>
                      <td>{tx.description}</td>
                      <td className="muted">
                        {tx.installmentNumber && tx.installmentTotal
                          ? `${tx.installmentNumber}/${tx.installmentTotal}`
                          : '—'}
                      </td>
                      <td className="td-num">{brl(tx.amount)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </Card>
  );
}
