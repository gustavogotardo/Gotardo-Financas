'use client';

import { useState } from 'react';
import type { AccountRecord, ImportRecord } from '@/lib/api';
import { Button, Card } from '@/components/ui';
import { ImportForm, ImportRow } from '@/components/import-form';

type Props = {
  accounts: AccountRecord[];
  imports: ImportRecord[];
  canManage: boolean;
  onReload: () => Promise<void>;
};

export function ImportsSection({ accounts, imports, canManage, onReload }: Props) {
  const [showImportForm, setShowImportForm] = useState(false);

  return (
    <section className="section">
      <div className="section-head">
        <h2>Importar extratos</h2>
        {canManage ? (
          <Button type="button" variant="ghost" onClick={() => setShowImportForm((show) => !show)}>
            {showImportForm ? 'Fechar' : '+ Importar extrato'}
          </Button>
        ) : null}
      </div>
      {showImportForm ? (
        <ImportForm
          accounts={accounts}
          onCancel={() => setShowImportForm(false)}
          onDone={async () => {
            setShowImportForm(false);
            await onReload();
          }}
        />
      ) : null}
      <Card>
        {imports.length === 0 ? (
          <p className="empty">Nenhuma importação ainda.</p>
        ) : (
          <div className="table-wrap">
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
                {imports.map((imported) => (
                  <ImportRow key={imported.id} imported={imported} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </section>
  );
}
