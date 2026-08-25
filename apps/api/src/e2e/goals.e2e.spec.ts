import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { PrismaModule, PrismaService } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { GoalsModule } from '../goals/goals.module';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';

process.env.DATABASE_URL =
  'postgresql://gotardo_test:gotardo_test@localhost:5433/gotardo_test?schema=public';
process.env.JWT_ACCESS_SECRET = 'e2e-jwt-secret';
process.env.JWT_ACCESS_TTL = '15m';
process.env.JWT_REFRESH_TTL = '30d';

type TokensResponse = { accessToken: string; refreshToken: string };
type MeResponse = { id: string; email: string; role: string; familyId: string };

type GoalResponse = {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
  targetAmount: string;
  deadline: string | null;
  priority: number;
  status: string;
  monthlyContribution: string | null;
  strategy: string | null;
  currentAmount: string;
  progress: string;
  monthlyRequired: string | null;
  predictedCompletionDate: string | null;
  isAtRisk: boolean;
};

/**
 * Mesma lógica de `GoalsService.addMonthsUtc`: soma `months` meses a `date`
 * clampando o dia no último dia válido do mês de destino.
 */
const addMonthsUtc = (date: Date, months: number): Date => {
  const targetYear = date.getUTCFullYear();
  const targetMonth = date.getUTCMonth() + months;
  const lastDayOfTargetMonth = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  const day = Math.min(date.getUTCDate(), lastDayOfTargetMonth);
  return new Date(Date.UTC(targetYear, targetMonth, day));
};

const todayUtcDateOnly = (): Date => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
};

/** Deadline calendar-month-diff a partir de hoje, mesma regra do serviço (mínimo 1). */
const mesesRestantes = (today: Date, deadline: Date): number => {
  const months =
    (deadline.getUTCFullYear() - today.getUTCFullYear()) * 12 +
    (deadline.getUTCMonth() - today.getUTCMonth());
  return months < 1 ? 1 : months;
};

describe('Metas e objetivos (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const suffix = randomUUID().slice(0, 8);
  const domain = `${suffix}.e2e.gotardo`;
  const createdFamilies: string[] = [];

  const emailFor = (tag: string): string => `${tag}@${domain}`;

  const register = (name: string, email: string, familyName: string) =>
    request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ name, email, password: 'senha-segura-123', familyName });

  const me = (token: string) =>
    request(app.getHttpServer()).get('/api/v1/auth/me').set('Authorization', `Bearer ${token}`);

  const setupFamily = async (tag: string) => {
    const email = emailFor(tag);
    const reg = await register(tag, email, `Família ${tag} ${suffix}`);
    const tokens = reg.body as TokensResponse;
    const meRes = await me(tokens.accessToken);
    const familyId = (meRes.body as MeResponse).familyId;
    createdFamilies.push(familyId);
    return { token: tokens.accessToken, familyId };
  };

  const createGoal = (token: string, body: Record<string, unknown>) =>
    request(app.getHttpServer())
      .post('/api/v1/goals')
      .set('Authorization', `Bearer ${token}`)
      .send(body);

  const getGoal = (token: string, id: string) =>
    request(app.getHttpServer())
      .get(`/api/v1/goals/${id}`)
      .set('Authorization', `Bearer ${token}`);

  const listGoals = (token: string) =>
    request(app.getHttpServer()).get('/api/v1/goals').set('Authorization', `Bearer ${token}`);

  const updateGoal = (token: string, id: string, body: Record<string, unknown>) =>
    request(app.getHttpServer())
      .patch(`/api/v1/goals/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .send(body);

  const deleteGoal = (token: string, id: string) =>
    request(app.getHttpServer())
      .delete(`/api/v1/goals/${id}`)
      .set('Authorization', `Bearer ${token}`);

  const allocate = (token: string, id: string, body: Record<string, unknown>) =>
    request(app.getHttpServer())
      .post(`/api/v1/goals/${id}/allocations`)
      .set('Authorization', `Bearer ${token}`)
      .send(body);

  const listAllocations = (token: string, id: string) =>
    request(app.getHttpServer())
      .get(`/api/v1/goals/${id}/allocations`)
      .set('Authorization', `Bearer ${token}`);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), PrismaModule, AuthModule, GoalsModule],
      providers: [
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        { provide: APP_GUARD, useClass: RolesGuard },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }),
    );
    await app.init();
    prisma = moduleRef.get(PrismaService);
  });

  afterAll(async () => {
    await prisma.$transaction([
      prisma.financialGoalAllocation.deleteMany({
        where: { goal: { familyId: { in: createdFamilies } } },
      }),
      prisma.financialGoal.deleteMany({ where: { familyId: { in: createdFamilies } } }),
      // O checker periódico de notificações (E3.2) roda de forma global sobre
      // todas as famílias do banco de testes; como outros specs e2e podem
      // acionar `runChecks()` enquanto esta suíte ainda tem famílias vivas,
      // suas notificações precisam ser limpas aqui antes de apagar os users.
      prisma.notification.deleteMany({ where: { familyId: { in: createdFamilies } } }),
      prisma.refreshToken.deleteMany({
        where: { user: { familyId: { in: createdFamilies } } },
      }),
      prisma.user.deleteMany({ where: { familyId: { in: createdFamilies } } }),
      prisma.family.deleteMany({ where: { id: { in: createdFamilies } } }),
    ]);
    await app.close();
  });

  it('cria, lista, busca, atualiza e remove (soft delete) um objetivo', async () => {
    const { token } = await setupFamily('crud');

    const created = await createGoal(token, {
      name: 'Reserva de emergência',
      description: 'Seis meses de despesas',
      targetAmount: 5000,
      priority: 1,
    });
    expect(created.status).toBe(201);
    const goal = created.body as GoalResponse;
    expect(goal.name).toBe('Reserva de emergência');
    expect(goal.targetAmount).toBe('5000');
    expect(goal.status).toBe('ACTIVE');
    expect(goal.priority).toBe(1);
    expect(goal.currentAmount).toBe('0');
    expect(goal.progress).toBe('0.00');

    const fetched = await getGoal(token, goal.id);
    expect(fetched.status).toBe(200);
    expect((fetched.body as GoalResponse).id).toBe(goal.id);

    const list = await listGoals(token);
    expect(list.status).toBe(200);
    expect((list.body as GoalResponse[]).some((g) => g.id === goal.id)).toBe(true);

    const updated = await updateGoal(token, goal.id, {
      name: 'Reserva de emergência (atualizada)',
      status: 'PAUSED',
    });
    expect(updated.status).toBe(200);
    expect((updated.body as GoalResponse).name).toBe('Reserva de emergência (atualizada)');
    expect((updated.body as GoalResponse).status).toBe('PAUSED');

    const removed = await deleteGoal(token, goal.id);
    expect(removed.status).toBe(204);

    const afterDelete = await getGoal(token, goal.id);
    expect(afterDelete.status).toBe(404);

    const listAfterDelete = await listGoals(token);
    expect((listAfterDelete.body as GoalResponse[]).some((g) => g.id === goal.id)).toBe(false);
  });

  it('família diferente não consegue ver objetivo de outra família (404)', async () => {
    const owner = await setupFamily('tenant-a');
    const intruder = await setupFamily('tenant-b');

    const created = await createGoal(owner.token, { name: 'Viagem', targetAmount: 3000 });
    const goalId = (created.body as GoalResponse).id;

    const asOwner = await getGoal(owner.token, goalId);
    expect(asOwner.status).toBe(200);

    const asIntruder = await getGoal(intruder.token, goalId);
    expect(asIntruder.status).toBe(404);

    const updateAsIntruder = await updateGoal(intruder.token, goalId, { name: 'Hackeado' });
    expect(updateAsIntruder.status).toBe(404);

    const deleteAsIntruder = await deleteGoal(intruder.token, goalId);
    expect(deleteAsIntruder.status).toBe(404);

    const allocateAsIntruder = await allocate(intruder.token, goalId, { amount: 10 });
    expect(allocateAsIntruder.status).toBe(404);

    const listAllocationsAsIntruder = await listAllocations(intruder.token, goalId);
    expect(listAllocationsAsIntruder.status).toBe(404);
  });

  it('calcula currentAmount e progress a partir das alocações', async () => {
    const { token } = await setupFamily('progress');

    const created = await createGoal(token, { name: 'Notebook novo', targetAmount: 1000 });
    const goalId = (created.body as GoalResponse).id;

    const alloc1 = await allocate(token, goalId, { amount: 300, note: 'Aporte 1' });
    expect(alloc1.status).toBe(201);
    const alloc2 = await allocate(token, goalId, { amount: 200, note: 'Aporte 2' });
    expect(alloc2.status).toBe(201);

    const fetched = await getGoal(token, goalId);
    expect(fetched.status).toBe(200);
    const body = fetched.body as GoalResponse;
    expect(body.currentAmount).toBe('500');
    expect(body.progress).toBe('50.00');

    const allocations = await listAllocations(token, goalId);
    expect(allocations.status).toBe(200);
    expect(allocations.body as unknown[]).toHaveLength(2);
  });

  it('calcula monthlyRequired com base no deadline (mesesRestantes = 5)', async () => {
    const { token } = await setupFamily('monthly-required');
    const today = todayUtcDateOnly();
    const deadline = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 5, 15, 12));

    const created = await createGoal(token, {
      name: 'Entrada do imóvel',
      targetAmount: 1200,
      deadline: deadline.toISOString(),
    });
    expect(created.status).toBe(201);
    const goalId = (created.body as GoalResponse).id;

    await allocate(token, goalId, { amount: 200 });

    const fetched = await getGoal(token, goalId);
    const body = fetched.body as GoalResponse;
    expect(body.currentAmount).toBe('200');

    const months = mesesRestantes(today, deadline);
    expect(months).toBe(5);
    // (1200 - 200) / 5 = 200.00
    expect(body.monthlyRequired).toBe('200.00');
  });

  it('calcula predictedCompletionDate com base em monthlyContribution', async () => {
    const { token } = await setupFamily('predicted-date');
    const today = todayUtcDateOnly();

    const created = await createGoal(token, {
      name: 'Curso de idiomas',
      targetAmount: 1000,
      monthlyContribution: 300,
    });
    expect(created.status).toBe(201);
    const goalId = (created.body as GoalResponse).id;

    await allocate(token, goalId, { amount: 100 });

    const fetched = await getGoal(token, goalId);
    const body = fetched.body as GoalResponse;
    expect(body.currentAmount).toBe('100');

    // shortfall = 900; monthsNeeded = ceil(900 / 300) = 3
    const expectedDate = addMonthsUtc(today, 3);
    expect(body.predictedCompletionDate).not.toBeNull();
    expect(body.predictedCompletionDate?.slice(0, 10)).toBe(
      expectedDate.toISOString().slice(0, 10),
    );
  });

  it('predictedCompletionDate é hoje quando o valor-alvo já foi atingido', async () => {
    const { token } = await setupFamily('predicted-reached');
    const today = todayUtcDateOnly();

    const created = await createGoal(token, {
      name: 'Meta já batida',
      targetAmount: 100,
      monthlyContribution: 50,
    });
    const goalId = (created.body as GoalResponse).id;

    await allocate(token, goalId, { amount: 150 });

    const fetched = await getGoal(token, goalId);
    const body = fetched.body as GoalResponse;
    expect(body.currentAmount).toBe('150');
    expect(body.predictedCompletionDate?.slice(0, 10)).toBe(today.toISOString().slice(0, 10));
  });

  it('isAtRisk = true quando a contribuição mensal é insuficiente para o prazo', async () => {
    const { token } = await setupFamily('at-risk-true');
    const today = todayUtcDateOnly();
    const deadline = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 3, 15, 12));

    const created = await createGoal(token, {
      name: 'Meta em risco',
      targetAmount: 3000,
      deadline: deadline.toISOString(),
      monthlyContribution: 100,
    });
    expect(created.status).toBe(201);
    const goalId = (created.body as GoalResponse).id;

    const fetched = await getGoal(token, goalId);
    const body = fetched.body as GoalResponse;
    // monthlyRequired = 3000 / 3 = 1000.00 > monthlyContribution (100)
    expect(body.monthlyRequired).toBe('1000.00');
    expect(body.isAtRisk).toBe(true);
  });

  it('isAtRisk = false quando a contribuição mensal é suficiente', async () => {
    const { token } = await setupFamily('at-risk-false-sufficient');
    const today = todayUtcDateOnly();
    const deadline = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 3, 15, 12));

    const created = await createGoal(token, {
      name: 'Meta viável',
      targetAmount: 3000,
      deadline: deadline.toISOString(),
      monthlyContribution: 1500,
    });
    const goalId = (created.body as GoalResponse).id;

    const fetched = await getGoal(token, goalId);
    expect((fetched.body as GoalResponse).isAtRisk).toBe(false);
  });

  it('isAtRisk = false quando não há monthlyContribution definido ainda', async () => {
    const { token } = await setupFamily('at-risk-false-no-contribution');
    const today = todayUtcDateOnly();
    const deadline = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 3, 15, 12));

    const created = await createGoal(token, {
      name: 'Meta sem contribuição definida',
      targetAmount: 3000,
      deadline: deadline.toISOString(),
    });
    const goalId = (created.body as GoalResponse).id;

    const fetched = await getGoal(token, goalId);
    expect((fetched.body as GoalResponse).isAtRisk).toBe(false);
  });

  it('isAtRisk = false para objetivo COMPLETED mesmo com deadline no passado', async () => {
    const { token } = await setupFamily('at-risk-false-completed');
    const today = todayUtcDateOnly();
    const pastDeadline = new Date(
      Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 2, 15, 12),
    );

    const created = await createGoal(token, {
      name: 'Meta antiga não concluída',
      targetAmount: 3000,
      deadline: pastDeadline.toISOString(),
    });
    const goalId = (created.body as GoalResponse).id;

    // Confere que, enquanto ACTIVE, o deadline no passado com valor não
    // atingido é sinalizado como em risco.
    const asActive = await getGoal(token, goalId);
    expect((asActive.body as GoalResponse).isAtRisk).toBe(true);

    const completed = await updateGoal(token, goalId, { status: 'COMPLETED' });
    expect(completed.status).toBe(200);
    expect((completed.body as GoalResponse).isAtRisk).toBe(false);

    const fetched = await getGoal(token, goalId);
    expect((fetched.body as GoalResponse).isAtRisk).toBe(false);
  });

  it('soft delete: alocações do objetivo não ficam órfãs nem quebram a API', async () => {
    const { token } = await setupFamily('soft-delete-allocations');

    const created = await createGoal(token, { name: 'Meta a remover', targetAmount: 500 });
    const goalId = (created.body as GoalResponse).id;

    const alloc = await allocate(token, goalId, { amount: 50 });
    expect(alloc.status).toBe(201);

    const removed = await deleteGoal(token, goalId);
    expect(removed.status).toBe(204);

    const afterDelete = await getGoal(token, goalId);
    expect(afterDelete.status).toBe(404);

    const listAfterDelete = await listGoals(token);
    expect((listAfterDelete.body as GoalResponse[]).some((g) => g.id === goalId)).toBe(false);

    const allocationsAfterDelete = await listAllocations(token, goalId);
    expect(allocationsAfterDelete.status).toBe(404);

    const dbAllocations = await prisma.financialGoalAllocation.findMany({
      where: { goalId },
    });
    expect(dbAllocations).toHaveLength(1);
  });
});
