'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { Button, Card, ErrorBox, Field, Input } from '@/components/ui';

export default function RegisterPage() {
  const { register } = useAuth();
  const router = useRouter();
  const [form, setForm] = useState({
    name: '',
    familyName: '',
    email: '',
    password: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function update(key: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((prev) => ({ ...prev, [key]: e.target.value }));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await register(form);
      router.replace('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao criar a conta.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-wrap">
      <Card className="auth-card">
        <h1 className="auth-title">Criar conta</h1>
        <p className="auth-sub">Comece a organizar as finanças da sua família.</p>
        <form onSubmit={onSubmit}>
          <Field label="Seu nome">
            <Input value={form.name} onChange={update('name')} required />
          </Field>
          <Field label="Nome da família" hint="Será criada junto com a sua conta.">
            <Input value={form.familyName} onChange={update('familyName')} required />
          </Field>
          <Field label="E-mail">
            <Input
              type="email"
              autoComplete="email"
              value={form.email}
              onChange={update('email')}
              required
            />
          </Field>
          <Field label="Senha" hint="Mínimo de 8 caracteres.">
            <Input
              type="password"
              autoComplete="new-password"
              minLength={8}
              value={form.password}
              onChange={update('password')}
              required
            />
          </Field>
          {error ? <ErrorBox>{error}</ErrorBox> : null}
          <Button type="submit" className="btn-block" disabled={submitting}>
            {submitting ? 'Criando…' : 'Criar conta'}
          </Button>
        </form>
        <p className="auth-alt">
          Já tem conta? <Link href="/login">Entrar</Link>
        </p>
      </Card>
    </div>
  );
}
