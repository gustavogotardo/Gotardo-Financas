'use client';

import Link from 'next/link';

export default function OfflinePage() {
  return (
    <main className="center">
      <section className="card">
        <h1>Você está offline</h1>
        <p>
          Sem conexão no momento. Os dados já carregados ficam disponíveis; tente novamente quando a
          conexão voltar.
        </p>
        <button type="button" onClick={() => window.location.reload()}>
          Tentar de novo
        </button>
        <Link href="/dashboard">Voltar ao painel</Link>
      </section>
    </main>
  );
}
