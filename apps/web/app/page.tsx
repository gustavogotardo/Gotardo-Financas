import { ApiStatus } from './api-status';

export default function Home() {
  return (
    <main style={{ maxWidth: 720, margin: '0 auto', padding: '3rem 1.5rem' }}>
      <h1>Gotardo Finanças</h1>
      <p>
        Gerenciamento e planejamento financeiro familiar. Monorepo E0.1 — fundação inicializada.
      </p>
      <ApiStatus />
    </main>
  );
}
