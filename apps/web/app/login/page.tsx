'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { Button, Card, ErrorBox, Field, Input } from '@/components/ui';

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email, password);
      router.replace('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao entrar.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-wrap">
      <Card className="auth-card">
        <h1 className="auth-title">Gotardo Finanças</h1>
        <p className="auth-sub">Acesse sua conta para continuar.</p>
        <form onSubmit={onSubmit}>
          <Field label="E-mail">
            <Input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </Field>
          <Field label="Senha">
            <Input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </Field>
          {error ? <ErrorBox>{error}</ErrorBox> : null}
          <Button type="submit" className="btn-block" disabled={submitting}>
            {submitting ? 'Entrando…' : 'Entrar'}
          </Button>
        </form>
        <p className="auth-alt">
          Ainda não tem conta? <Link href="/register">Criar conta</Link>
        </p>
      </Card>
    </div>
  );
}
