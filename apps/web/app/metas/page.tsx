'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { apiFetch, type GoalRecord } from '@/lib/api';
import { brl, formatDate, goalStatusLabel } from '@/lib/format';
import { Badge, Button, Card, ErrorBox, Spinner } from '@/components/ui';
import { GoalForm } from '@/components/goal-form';
import { GoalAllocationForm } from '@/components/goal-allocation-form';

function goalStatusTone(status: string): 'success' | 'warning' | 'danger' | 'info' {
  switch (status) {
    case 'COMPLETED':
      return 'success';
    case 'PAUSED':
      return 'warning';
    case 'CANCELLED':
      return 'danger';
    default:
      return 'info';
  }
}

export default function GoalsPage() {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const [goals, setGoals] = useState<GoalRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showGoalForm, setShowGoalForm] = useState(false);
  const [editingGoal, setEditingGoal] = useState<GoalRecord | null>(null);
  const [allocatingGoal, setAllocatingGoal] = useState<GoalRecord | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await apiFetch<GoalRecord[]>('/api/v1/goals');
      setGoals(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao carregar as metas.');
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

  async function handleLogout() {
    await logout();
    router.replace('/login');
  }

  return (
    <div>
      <header className="topbar">
        <div className="container topbar-inner">
          <span className="brand">Gotardo Finanças</span>
          <div className="topbar-user">
            <span>
              {user.family.name} · {user.name}
            </span>
            <Button type="button" variant="ghost" onClick={() => router.push('/dashboard')}>
              Dashboard
            </Button>
            <Button type="button" variant="ghost" onClick={() => router.push('/familia')}>
              Família
            </Button>
            <Button type="button" variant="ghost" onClick={() => void handleLogout()}>
              Sair
            </Button>
          </div>
        </div>
      </header>

      <main className="container">
        <div className="page-head">
          <h1>Metas</h1>
          {canManage ? (
            <Button
              type="button"
              onClick={() => {
                setEditingGoal(null);
                setShowGoalForm((show) => !show);
              }}
            >
              {showGoalForm ? 'Fechar' : '+ Nova meta'}
            </Button>
          ) : null}
        </div>

        {error ? <ErrorBox>{error}</ErrorBox> : null}

        {editingGoal ? (
          <GoalForm
            goal={editingGoal}
            onCancel={() => setEditingGoal(null)}
            onDone={async () => {
              setEditingGoal(null);
              setShowGoalForm(false);
              await load();
            }}
          />
        ) : showGoalForm ? (
          <GoalForm
            onCancel={() => setShowGoalForm(false)}
            onDone={async () => {
              setShowGoalForm(false);
              await load();
            }}
          />
        ) : null}

        {allocatingGoal ? (
          <GoalAllocationForm
            goal={allocatingGoal}
            onCancel={() => setAllocatingGoal(null)}
            onDone={async () => {
              setAllocatingGoal(null);
              await load();
            }}
          />
        ) : null}

        {!goals ? (
          <Spinner />
        ) : goals.length === 0 ? (
          <Card>
            <p className="empty">Nenhuma meta cadastrada ainda.</p>
          </Card>
        ) : (
          <div className="goal-grid">
            {goals.map((goal) => {
              const progress = Math.min(100, Math.max(0, Number(goal.progress)));
              return (
                <Card key={goal.id} className="goal-card">
                  <div className="goal-card-head">
                    <span className="goal-card-title">
                      {goal.icon ? <span>{goal.icon} </span> : null}
                      {goal.name}
                    </span>
                    <div className="goal-card-badges">
                      <Badge tone={goalStatusTone(goal.status)}>
                        {goalStatusLabel(goal.status)}
                      </Badge>
                      {goal.isAtRisk ? <Badge tone="danger">Em risco</Badge> : null}
                    </div>
                  </div>

                  {goal.description ? <p className="muted">{goal.description}</p> : null}

                  <div className="progress" title={`${progress.toFixed(0)}% da meta`}>
                    <span className="progress-fill" style={{ width: `${progress}%` }} />
                  </div>
                  <div className="goal-card-amounts">
                    <span>
                      {brl(goal.currentAmount)} / {brl(goal.targetAmount)}
                    </span>
                    <span className="muted">{progress.toFixed(0)}%</span>
                  </div>

                  {goal.deadline ? (
                    <p className="muted small">Prazo: {formatDate(goal.deadline)}</p>
                  ) : null}
                  {goal.monthlyRequired ? (
                    <p className="muted small">Necessário por mês: {brl(goal.monthlyRequired)}</p>
                  ) : null}
                  {goal.predictedCompletionDate ? (
                    <p className="muted small">
                      Previsão de conclusão: {formatDate(goal.predictedCompletionDate)}
                    </p>
                  ) : null}

                  {canManage ? (
                    <div className="form-actions">
                      <Button type="button" variant="ghost" onClick={() => setAllocatingGoal(goal)}>
                        Alocar
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => {
                          setShowGoalForm(false);
                          setEditingGoal(goal);
                        }}
                      >
                        Editar
                      </Button>
                    </div>
                  ) : null}
                </Card>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
