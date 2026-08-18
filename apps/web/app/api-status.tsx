'use client';

import { useEffect, useState } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

type ApiHealth = {
  data: {
    status: string;
    service: string;
    version: string;
    uptime: number;
  };
};

export function ApiStatus() {
  const [state, setState] = useState<'loading' | 'ok' | 'error'>('loading');

  useEffect(() => {
    fetch(`${API_URL}/api/v1/health`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<ApiHealth>;
      })
      .then((body) => {
        if (body.data.status === 'ok') setState('ok');
        else setState('error');
      })
      .catch(() => setState('error'));
  }, []);

  if (state === 'loading') return <p>Verificando API…</p>;
  if (state === 'ok') return <p style={{ color: 'green' }}>API online em {API_URL}/api/v1</p>;
  return (
    <p style={{ color: 'tomato' }}>
      API indisponível. Inicie com <code>pnpm dev</code> e acesse {API_URL}/api/v1/health.
    </p>
  );
}
