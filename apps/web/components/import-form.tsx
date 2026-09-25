'use client';

import { useState, type ChangeEvent, type FormEvent } from 'react';
import { apiUpload, type AccountRecord, type ImportRecord } from '@/lib/api';
import { formatBytes, formatDate } from '@/lib/format';
import { Badge, Button, Card, ErrorBox, Field, Select } from './ui';

type Props = {
  accounts: AccountRecord[];
  onDone: () => Promise<void>;
  onCancel: () => void;
};

function importStatusTone(status: string): 'success' | 'danger' | 'warning' | 'info' {
  switch (status) {
    case 'PROCESSED':
      return 'success';
    case 'FAILED':
      return 'danger';
    case 'PENDING':
      return 'warning';
    default:
      return 'info';
  }
}

function importStatusLabel(status: string): string {
  switch (status) {
    case 'PROCESSED':
      return 'Processado';
    case 'FAILED':
      return 'Falhou';
    case 'PENDING':
      return 'Pendente';
    default:
      return status;
  }
}

export function ImportForm({ accounts, onDone, onCancel }: Props) {
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? '');
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function onFileChange(e: ChangeEvent<HTMLInputElement>) {
    setFile(e.target.files?.[0] ?? null);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!file) {
      setError('Selecione um arquivo OFX/QFX, CSV, XLSX ou PDF (extrato do Itaú).');
      return;
    }
    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('accountId', accountId);
      formData.append('file', file);
      const imported = await apiUpload<ImportRecord>('/api/v1/imports', formData);
      if (imported.status === 'FAILED') {
        setError(imported.errorMessage ?? 'Falha ao processar o arquivo.');
        return;
      }
      await onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao importar o arquivo.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card>
      <form className="form" onSubmit={(e) => void onSubmit(e)}>
        <div className="form-grid">
          <Field label="Conta de destino">
            <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Arquivo (OFX/QFX, CSV, XLSX ou PDF do Itaú)">
            <input type="file" accept=".ofx,.qfx,.csv,.xlsx,.pdf" onChange={onFileChange} />
          </Field>
        </div>
        {error ? <ErrorBox>{error}</ErrorBox> : null}
        <div className="form-actions">
          <Button type="submit" disabled={submitting}>
            {submitting ? 'Importando…' : 'Importar'}
          </Button>
          <Button type="button" variant="ghost" onClick={onCancel} disabled={submitting}>
            Fechar
          </Button>
        </div>
      </form>
    </Card>
  );
}

export function ImportBadge({ status }: { status: string }) {
  return <Badge tone={importStatusTone(status)}>{importStatusLabel(status)}</Badge>;
}

export function ImportRow({ imported }: { imported: ImportRecord }) {
  return (
    <tr>
      <td>{imported.originalName}</td>
      <td>{formatDate(imported.createdAt)}</td>
      <td className="td-num">{formatBytes(imported.sizeBytes)}</td>
      <td className="td-num">{imported.transactionCount}</td>
      <td>
        <ImportBadge status={imported.status} />
        {imported.errorMessage ? (
          <span className="muted" title={imported.errorMessage}>
            {' '}
            ⚠
          </span>
        ) : null}
      </td>
    </tr>
  );
}
