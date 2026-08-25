'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { apiFetch, type CreateInvitationInput, type FamilyResponse } from '@/lib/api';
import { roleLabel } from '@/lib/format';
import { Badge, Button, Card, ErrorBox, Field, Input, Select, Spinner } from '@/components/ui';

const ROLES = ['OWNER', 'ADMIN', 'MEMBER', 'VIEWER'];

function roleTone(role: string): 'success' | 'warning' | 'info' | 'neutral' {
  switch (role) {
    case 'OWNER':
      return 'success';
    case 'ADMIN':
      return 'warning';
    case 'MEMBER':
      return 'info';
    default:
      return 'neutral';
  }
}

export default function FamilyPage() {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const [family, setFamily] = useState<FamilyResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('MEMBER');
  const [inviting, setInviting] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [changingRoleId, setChangingRoleId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const family = await apiFetch<FamilyResponse>('/api/v1/family');
      setFamily(family);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao carregar a família.');
    }
  }, []);

  useEffect(() => {
    if (user) void load();
  }, [user, load]);

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [loading, user, router]);

  if (loading || !user) {
    return (
      <div className="auth-wrap">
        <Spinner />
      </div>
    );
  }

  const canManage = user.role === 'OWNER' || user.role === 'ADMIN';

  async function handleInvite(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setInviting(true);
    try {
      const payload: CreateInvitationInput = { email: inviteEmail, role: inviteRole };
      await apiFetch<{ id: string }>('/api/v1/family/invitations', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      setInviteEmail('');
      setInviteRole('MEMBER');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao criar o convite.');
    } finally {
      setInviting(false);
    }
  }

  async function revokeInvitation(id: string) {
    setRevokingId(id);
    setError(null);
    try {
      await apiFetch(`/api/v1/family/invitations/${id}`, { method: 'DELETE' });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao revogar o convite.');
    } finally {
      setRevokingId(null);
    }
  }

  async function changeRole(memberId: string, role: string) {
    setChangingRoleId(memberId);
    setError(null);
    try {
      await apiFetch(`/api/v1/family/members/${memberId}/role`, {
        method: 'PATCH',
        body: JSON.stringify({ role }),
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao alterar o papel.');
      await load();
    } finally {
      setChangingRoleId(null);
    }
  }

  async function handleLogout() {
    await logout();
    router.replace('/login');
  }

  const canChangeRoleOf = (memberId: string, memberRole: string): boolean => {
    if (!canManage) return false;
    if (memberId === user.id) return false;
    if (memberRole === 'OWNER' && user.role !== 'OWNER') return false;
    return true;
  };

  return (
    <div>
      <header className="topbar">
        <div className="container topbar-inner">
          <span className="brand">Gotardo Finanças</span>
          <div className="topbar-user">
            <span>
              {family?.name ?? user.family.name} · {user.name}
            </span>
            <Button type="button" variant="ghost" onClick={() => router.push('/dashboard')}>
              Dashboard
            </Button>
            <Button type="button" variant="ghost" onClick={() => router.push('/metas')}>
              Metas
            </Button>
            <Button type="button" variant="ghost" onClick={() => void handleLogout()}>
              Sair
            </Button>
          </div>
        </div>
      </header>

      <main className="container">
        <div className="page-head">
          <h1>Família</h1>
        </div>

        {error ? <ErrorBox>{error}</ErrorBox> : null}

        {!family ? (
          <Spinner />
        ) : (
          <>
            <section className="section">
              <div className="section-head">
                <h2>Membros ({family.users.length})</h2>
              </div>
              <Card>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Nome</th>
                      <th>Email</th>
                      <th>Papel</th>
                      {canManage ? <th>Ações</th> : null}
                    </tr>
                  </thead>
                  <tbody>
                    {family.users.map((member) => (
                      <tr key={member.id}>
                        <td>
                          {member.name}
                          {member.id === user.id ? <span className="muted"> (você)</span> : null}
                        </td>
                        <td className="muted">{member.email}</td>
                        <td>
                          <Badge tone={roleTone(member.role)}>{roleLabel(member.role)}</Badge>
                        </td>
                        {canManage ? (
                          <td>
                            {canChangeRoleOf(member.id, member.role) ? (
                              <Select
                                value={member.role}
                                disabled={changingRoleId === member.id}
                                onChange={(e) => void changeRole(member.id, e.target.value)}
                              >
                                {ROLES.filter(
                                  (role) => role !== 'OWNER' || user.role === 'OWNER',
                                ).map((role) => (
                                  <option key={role} value={role}>
                                    {roleLabel(role)}
                                  </option>
                                ))}
                              </Select>
                            ) : (
                              <span className="muted">—</span>
                            )}
                          </td>
                        ) : null}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            </section>

            {canManage ? (
              <section className="section">
                <div className="section-head">
                  <h2>Convites pendentes</h2>
                </div>
                <Card>
                  <form className="form" onSubmit={(e) => void handleInvite(e)}>
                    <div className="form-grid">
                      <Field label="Email">
                        <Input
                          type="email"
                          required
                          value={inviteEmail}
                          placeholder="convidado@exemplo.com"
                          onChange={(e) => setInviteEmail(e.target.value)}
                        />
                      </Field>
                      <Field label="Papel">
                        <Select value={inviteRole} onChange={(e) => setInviteRole(e.target.value)}>
                          {ROLES.filter((role) => role !== 'OWNER' || user.role === 'OWNER').map(
                            (role) => (
                              <option key={role} value={role}>
                                {roleLabel(role)}
                              </option>
                            ),
                          )}
                        </Select>
                      </Field>
                    </div>
                    <div className="form-actions">
                      <Button type="submit" disabled={inviting}>
                        {inviting ? 'Convidando…' : 'Convidar'}
                      </Button>
                    </div>
                  </form>

                  {family.invitations.length === 0 ? (
                    <p className="empty">Nenhum convite pendente.</p>
                  ) : (
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Email</th>
                          <th>Papel</th>
                          <th>Expira em</th>
                          <th>Ações</th>
                        </tr>
                      </thead>
                      <tbody>
                        {family.invitations.map((invitation) => (
                          <tr key={invitation.id}>
                            <td>{invitation.email}</td>
                            <td>
                              <Badge tone={roleTone(invitation.role)}>
                                {roleLabel(invitation.role)}
                              </Badge>
                            </td>
                            <td className="muted">
                              {new Date(invitation.expiresAt).toLocaleDateString('pt-BR')}
                            </td>
                            <td>
                              <Button
                                type="button"
                                variant="ghost"
                                disabled={revokingId === invitation.id}
                                onClick={() => void revokeInvitation(invitation.id)}
                              >
                                {revokingId === invitation.id ? 'Revogando…' : 'Revogar'}
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </Card>
              </section>
            ) : null}
          </>
        )}
      </main>
    </div>
  );
}
