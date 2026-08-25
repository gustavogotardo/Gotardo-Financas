import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { PrismaModule, PrismaService } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { AccountsModule } from '../accounts/accounts.module';
import { TransactionsModule } from '../transactions/transactions.module';
import { EnvelopesModule } from '../envelopes/envelopes.module';
import { GoalsModule } from '../goals/goals.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { NotificationsCheckerService } from '../notifications/notifications-checker.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';

process.env.DATABASE_URL =
  'postgresql://gotardo_test:gotardo_test@localhost:5433/gotardo_test?schema=public';
process.env.JWT_ACCESS_SECRET = 'e2e-jwt-secret';
process.env.JWT_ACCESS_TTL = '15m';
process.env.JWT_REFRESH_TTL = '30d';

type TokensResponse = { accessToken: string; refreshToken: string };
type MeResponse = { id: string; email: string; role: string; familyId: string };

type NotificationResponse = {
  id: string;
  familyId: string;
  userId: string;
  type: string;
  title: string;
  message: string;
  severity: string;
  isRead: boolean;
  actionUrl: string | null;
  dedupeKey: string;
  createdAt: string;
  readAt: string | null;
};

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

const todayUtc = (): Date => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
};

describe('Notificações (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let checker: NotificationsCheckerService;
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
    const meBody = meRes.body as MeResponse;
    createdFamilies.push(meBody.familyId);
    return { token: tokens.accessToken, familyId: meBody.familyId, userId: meBody.id };
  };

  const createEnvelope = (token: string, body: Record<string, unknown>) =>
    request(app.getHttpServer())
      .post('/api/v1/envelopes')
      .set('Authorization', `Bearer ${token}`)
      .send(body);

  const allocateEnvelope = (token: string, id: string, body: Record<string, unknown>) =>
    request(app.getHttpServer())
      .post(`/api/v1/envelopes/${id}/allocations`)
      .set('Authorization', `Bearer ${token}`)
      .send(body);

  const createCheckingAccount = (token: string, name: string) =>
    request(app.getHttpServer())
      .post('/api/v1/accounts')
      .set('Authorization', `Bearer ${token}`)
      .send({ name, type: 'CHECKING' });

  const createCreditCard = (token: string, name: string) =>
    request(app.getHttpServer())
      .post('/api/v1/accounts')
      .set('Authorization', `Bearer ${token}`)
      .send({ name, type: 'CREDIT_CARD', billingDay: 10, dueDay: 10 });

  const createTransaction = (token: string, body: Record<string, unknown>) =>
    request(app.getHttpServer())
      .post('/api/v1/transactions')
      .set('Authorization', `Bearer ${token}`)
      .send(body);

  const createGoal = (token: string, body: Record<string, unknown>) =>
    request(app.getHttpServer())
      .post('/api/v1/goals')
      .set('Authorization', `Bearer ${token}`)
      .send(body);

  const listNotifications = (token: string) =>
    request(app.getHttpServer())
      .get('/api/v1/notifications')
      .set('Authorization', `Bearer ${token}`);

  const markRead = (token: string, id: string) =>
    request(app.getHttpServer())
      .patch(`/api/v1/notifications/${id}/read`)
      .set('Authorization', `Bearer ${token}`);

  const markAllRead = (token: string) =>
    request(app.getHttpServer())
      .post('/api/v1/notifications/read-all')
      .set('Authorization', `Bearer ${token}`);

  const getPreferences = (token: string) =>
    request(app.getHttpServer())
      .get('/api/v1/notifications/preferences')
      .set('Authorization', `Bearer ${token}`);

  const updatePreferences = (token: string, body: Record<string, unknown>) =>
    request(app.getHttpServer())
      .patch('/api/v1/notifications/preferences')
      .set('Authorization', `Bearer ${token}`)
      .send(body);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        ScheduleModule.forRoot(),
        PrismaModule,
        AuthModule,
        AccountsModule,
        TransactionsModule,
        EnvelopesModule,
        GoalsModule,
        NotificationsModule,
      ],
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
    checker = moduleRef.get(NotificationsCheckerService);
  });

  afterAll(async () => {
    await prisma.$transaction([
      prisma.notification.deleteMany({ where: { familyId: { in: createdFamilies } } }),
      prisma.document.deleteMany({ where: { familyId: { in: createdFamilies } } }),
      prisma.transaction.deleteMany({ where: { familyId: { in: createdFamilies } } }),
      prisma.envelopeAllocation.deleteMany({
        where: { envelope: { familyId: { in: createdFamilies } } },
      }),
      prisma.envelope.deleteMany({ where: { familyId: { in: createdFamilies } } }),
      prisma.financialGoalAllocation.deleteMany({
        where: { goal: { familyId: { in: createdFamilies } } },
      }),
      prisma.financialGoal.deleteMany({ where: { familyId: { in: createdFamilies } } }),
      prisma.account.deleteMany({ where: { familyId: { in: createdFamilies } } }),
      prisma.refreshToken.deleteMany({
        where: { user: { familyId: { in: createdFamilies } } },
      }),
      prisma.user.deleteMany({ where: { familyId: { in: createdFamilies } } }),
      prisma.family.deleteMany({ where: { id: { in: createdFamilies } } }),
    ]);
    await app.close();
  });

  it('BUDGET_EXCEEDED dispara quando o gasto do mês supera o alocado e não duplica em uma segunda checagem', async () => {
    const { token } = await setupFamily('budget');
    const account = await createCheckingAccount(token, 'Conta orçamento');
    const accountId = (account.body as { id: string }).id;

    const envelope = await createEnvelope(token, { name: 'Mercado' });
    const envelopeId = (envelope.body as { id: string }).id;

    const alloc = await allocateEnvelope(token, envelopeId, { amount: 100 });
    expect(alloc.status).toBe(201);

    const tx = await createTransaction(token, {
      accountId,
      envelopeId,
      description: 'Compra no mercado',
      amount: 150,
      type: 'EXPENSE',
      status: 'CONFIRMED',
    });
    expect(tx.status).toBe(201);

    await checker.runChecks();

    const afterFirst = await listNotifications(token);
    const budgetNotifications = (afterFirst.body as NotificationResponse[]).filter(
      (n) => n.type === 'BUDGET_EXCEEDED' && n.dedupeKey.includes(envelopeId),
    );
    expect(budgetNotifications).toHaveLength(1);
    expect(budgetNotifications[0]?.severity).toBe('WARNING');
    expect(budgetNotifications[0]?.message).toContain('Mercado');

    // Segunda checagem no mesmo mês não deve duplicar (dedupeKey já existe).
    await checker.runChecks();
    const afterSecond = await listNotifications(token);
    const budgetNotificationsAfterSecond = (afterSecond.body as NotificationResponse[]).filter(
      (n) => n.type === 'BUDGET_EXCEEDED' && n.dedupeKey.includes(envelopeId),
    );
    expect(budgetNotificationsAfterSecond).toHaveLength(1);
  });

  it('BUDGET_EXCEEDED dispara para envelope alocado em mês passado e estourado por gasto no mês corrente (saldo all-time, não recorte mensal)', async () => {
    const { token } = await setupFamily('budget-past-alloc');
    const account = await createCheckingAccount(token, 'Conta orçamento passado');
    const accountId = (account.body as { id: string }).id;

    const envelope = await createEnvelope(token, { name: 'Assinatura' });
    const envelopeId = (envelope.body as { id: string }).id;

    const today = todayUtc();
    // Alocação feita há dois meses: sob o antigo recorte mensal do check,
    // `allocated` do mês corrente seria 0 e o alerta nunca dispararia de
    // novo depois que o mês da alocação passasse — mesmo com o envelope
    // permanentemente estourado (saldo all-time negativo).
    const pastMonthDate = new Date(
      Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 2, 10, 12),
    );

    const alloc = await allocateEnvelope(token, envelopeId, {
      amount: 100,
      date: pastMonthDate.toISOString(),
    });
    expect(alloc.status).toBe(201);

    const tx = await createTransaction(token, {
      accountId,
      envelopeId,
      description: 'Gasto do mês atual',
      amount: 150,
      type: 'EXPENSE',
      status: 'CONFIRMED',
      date: today.toISOString(),
    });
    expect(tx.status).toBe(201);

    await checker.runChecks();

    const after = await listNotifications(token);
    const budgetNotifications = (after.body as NotificationResponse[]).filter(
      (n) => n.type === 'BUDGET_EXCEEDED' && n.dedupeKey.includes(envelopeId),
    );
    expect(budgetNotifications).toHaveLength(1);
    expect(budgetNotifications[0]?.message).toContain('Assinatura');
  });

  it('BUDGET_EXCEEDED não dispara quando o envelope não tem orçamento alocado', async () => {
    const { token } = await setupFamily('budget-no-alloc');
    const account = await createCheckingAccount(token, 'Conta sem orçamento');
    const accountId = (account.body as { id: string }).id;

    const envelope = await createEnvelope(token, { name: 'Lazer' });
    const envelopeId = (envelope.body as { id: string }).id;

    const tx = await createTransaction(token, {
      accountId,
      envelopeId,
      description: 'Cinema',
      amount: 50,
      type: 'EXPENSE',
      status: 'CONFIRMED',
    });
    expect(tx.status).toBe(201);

    await checker.runChecks();

    const after = await listNotifications(token);
    const budgetNotifications = (after.body as NotificationResponse[]).filter(
      (n) => n.type === 'BUDGET_EXCEEDED' && n.dedupeKey.includes(envelopeId),
    );
    expect(budgetNotifications).toHaveLength(0);
  });

  it('GOAL_AT_RISK dispara para uma meta cuja contribuição mensal é insuficiente', async () => {
    const { token } = await setupFamily('goal-risk');
    const today = todayUtc();
    const deadline = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 3, 15, 12));

    const goal = await createGoal(token, {
      name: 'Viagem dos sonhos',
      targetAmount: 3000,
      deadline: deadline.toISOString(),
      monthlyContribution: 100,
    });
    expect(goal.status).toBe(201);
    const goalId = (goal.body as { id: string }).id;

    await checker.runChecks();

    const after = await listNotifications(token);
    const goalNotifications = (after.body as NotificationResponse[]).filter(
      (n) => n.type === 'GOAL_AT_RISK' && n.dedupeKey.includes(goalId),
    );
    expect(goalNotifications).toHaveLength(1);
    expect(goalNotifications[0]?.severity).toBe('WARNING');
    expect(goalNotifications[0]?.actionUrl).toBe('/metas');
    expect(goalNotifications[0]?.message).toContain('Viagem dos sonhos');
  });

  it('GOAL_AT_RISK não dispara para uma meta com contribuição suficiente', async () => {
    const { token } = await setupFamily('goal-safe');
    const today = todayUtc();
    const deadline = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 3, 15, 12));

    const goal = await createGoal(token, {
      name: 'Meta tranquila',
      targetAmount: 3000,
      deadline: deadline.toISOString(),
      monthlyContribution: 1500,
    });
    const goalId = (goal.body as { id: string }).id;

    await checker.runChecks();

    const after = await listNotifications(token);
    const goalNotifications = (after.body as NotificationResponse[]).filter(
      (n) => n.type === 'GOAL_AT_RISK' && n.dedupeKey.includes(goalId),
    );
    expect(goalNotifications).toHaveLength(0);
  });

  it('duas execuções concorrentes de runChecks() não duplicam a notificação (corrida TOCTOU tratada via P2002)', async () => {
    const { token } = await setupFamily('goal-risk-concurrent');
    const today = todayUtc();
    const deadline = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 3, 15, 12));

    const goal = await createGoal(token, {
      name: 'Meta concorrente',
      targetAmount: 3000,
      deadline: deadline.toISOString(),
      monthlyContribution: 100,
    });
    expect(goal.status).toBe(201);
    const goalId = (goal.body as { id: string }).id;

    // Duas checagens completas em paralelo: ambas veem o `findFirst` de
    // dedupe vazio antes de qualquer uma inserir — sem a constraint única
    // (+ catch de P2002) isso duplicaria a notificação.
    await Promise.all([checker.runChecks(), checker.runChecks()]);

    const after = await listNotifications(token);
    const goalNotifications = (after.body as NotificationResponse[]).filter(
      (n) => n.type === 'GOAL_AT_RISK' && n.dedupeKey.includes(goalId),
    );
    expect(goalNotifications).toHaveLength(1);
  });

  it('ACCOUNT_DUE dispara quando o vencimento da fatura está a até 3 dias e não para vencimentos distantes', async () => {
    const { token } = await setupFamily('account-due');
    const today = todayUtc();
    const day = today.getUTCDate();

    // "Próximo": billingDay logo à frente de hoje (ciclo do mês corrente ainda
    // não fechou -> a fatura em aberto é a que fechou no mês anterior, com
    // vencimento em dueDay *deste* mês) — mesma fórmula usada por getInvoice.
    // Os clamps em 28 evitam estourar o limite válido de dia perto do fim do mês.
    const nearBillingDay = Math.min(28, day + 1);
    const nearDueDay = Math.min(28, day + 2);

    // "Distante": billingDay já passado (dia 1, sempre <= hoje) -> o ciclo já
    // fechou este mês, vencimento cai no mês seguinte -> sempre a ~3-4
    // semanas de distância, independente do dia em que o teste rodar.
    const farBillingDay = 1;
    const farDueDay = 15;

    const near = await createCreditCard(token, 'Cartão próximo do vencimento');
    const nearId = (near.body as { id: string }).id;
    await prisma.account.update({
      where: { id: nearId },
      data: { billingDay: nearBillingDay, dueDay: nearDueDay },
    });

    const far = await createCreditCard(token, 'Cartão distante do vencimento');
    const farId = (far.body as { id: string }).id;
    await prisma.account.update({
      where: { id: farId },
      data: { billingDay: farBillingDay, dueDay: farDueDay },
    });

    await checker.runChecks();

    const after = await listNotifications(token);
    const notifications = after.body as NotificationResponse[];
    const nearNotifications = notifications.filter(
      (n) => n.type === 'ACCOUNT_DUE' && n.dedupeKey.includes(nearId),
    );
    const farNotifications = notifications.filter(
      (n) => n.type === 'ACCOUNT_DUE' && n.dedupeKey.includes(farId),
    );
    expect(nearNotifications).toHaveLength(1);
    expect(nearNotifications[0]?.severity).toBe('INFO');
    expect(nearNotifications[0]?.message).toContain('Cartão próximo do vencimento');
    expect(farNotifications).toHaveLength(0);
  });

  it('DOCUMENT_PENDING dispara uma única vez para um documento pendente há mais de 24h', async () => {
    const { token, familyId } = await setupFamily('doc-pending');

    const document = await prisma.document.create({
      data: {
        familyId,
        storageKey: `test/${randomUUID()}.ofx`,
        originalName: 'extrato-pendente.ofx',
        mimeType: 'application/x-ofx',
        sizeBytes: 100,
        status: 'PENDING',
        createdAt: new Date(Date.now() - 25 * ONE_DAY_MS),
      },
    });

    await checker.runChecks();
    await checker.runChecks();

    const after = await listNotifications(token);
    const docNotifications = (after.body as NotificationResponse[]).filter(
      (n) => n.type === 'DOCUMENT_PENDING' && n.dedupeKey.includes(document.id),
    );
    expect(docNotifications).toHaveLength(1);
    expect(docNotifications[0]?.severity).toBe('INFO');
    expect(docNotifications[0]?.message).toContain('extrato-pendente.ofx');
    expect(docNotifications[0]?.dedupeKey).toBe(`DOCUMENT_PENDING:${document.id}`);
  });

  it('DOCUMENT_PENDING não dispara para documento pendente há menos de 24h', async () => {
    const { token, familyId } = await setupFamily('doc-fresh');
    const document = await prisma.document.create({
      data: {
        familyId,
        storageKey: `test/${randomUUID()}.ofx`,
        originalName: 'extrato-recente.ofx',
        mimeType: 'application/x-ofx',
        sizeBytes: 100,
        status: 'PENDING',
      },
    });

    await checker.runChecks();

    const after = await listNotifications(token);
    const docNotifications = (after.body as NotificationResponse[]).filter(
      (n) => n.type === 'DOCUMENT_PENDING' && n.dedupeKey.includes(document.id),
    );
    expect(docNotifications).toHaveLength(0);
  });

  it('usuário que silenciou um tipo não recebe notificações desse tipo', async () => {
    const { token, familyId } = await setupFamily('muted');

    const mute = await updatePreferences(token, { mutedNotificationTypes: ['DOCUMENT_PENDING'] });
    expect(mute.status).toBe(200);
    expect((mute.body as { mutedNotificationTypes: string[] }).mutedNotificationTypes).toEqual([
      'DOCUMENT_PENDING',
    ]);

    const document = await prisma.document.create({
      data: {
        familyId,
        storageKey: `test/${randomUUID()}.ofx`,
        originalName: 'extrato-silenciado.ofx',
        mimeType: 'application/x-ofx',
        sizeBytes: 100,
        status: 'PENDING',
        createdAt: new Date(Date.now() - 25 * ONE_DAY_MS),
      },
    });

    await checker.runChecks();

    const after = await listNotifications(token);
    const docNotifications = (after.body as NotificationResponse[]).filter(
      (n) => n.type === 'DOCUMENT_PENDING' && n.dedupeKey.includes(document.id),
    );
    expect(docNotifications).toHaveLength(0);
  });

  it('GET/PATCH de preferências reflete mutedNotificationTypes', async () => {
    const { token } = await setupFamily('preferences');

    const initial = await getPreferences(token);
    expect(initial.status).toBe(200);
    expect((initial.body as { mutedNotificationTypes: string[] }).mutedNotificationTypes).toEqual(
      [],
    );

    const updated = await updatePreferences(token, {
      mutedNotificationTypes: ['BUDGET_EXCEEDED', 'ACCOUNT_DUE'],
    });
    expect(updated.status).toBe(200);
    expect(
      (updated.body as { mutedNotificationTypes: string[] }).mutedNotificationTypes.sort(),
    ).toEqual(['ACCOUNT_DUE', 'BUDGET_EXCEEDED']);

    const fetched = await getPreferences(token);
    expect((fetched.body as { mutedNotificationTypes: string[] }).mutedNotificationTypes.sort()).toEqual(
      ['ACCOUNT_DUE', 'BUDGET_EXCEEDED'],
    );
  });

  it('rejeita tipo inválido em mutedNotificationTypes (400)', async () => {
    const { token } = await setupFamily('preferences-invalid');
    const res = await updatePreferences(token, { mutedNotificationTypes: ['NOT_A_TYPE'] });
    expect(res.status).toBe(400);
  });

  it('lista, marca como lida e marca todas como lidas as próprias notificações', async () => {
    const { token, familyId } = await setupFamily('crud');
    const document = await prisma.document.create({
      data: {
        familyId,
        storageKey: `test/${randomUUID()}.ofx`,
        originalName: 'crud.ofx',
        mimeType: 'application/x-ofx',
        sizeBytes: 100,
        status: 'PENDING',
        createdAt: new Date(Date.now() - 25 * ONE_DAY_MS),
      },
    });
    await checker.runChecks();

    const list = await listNotifications(token);
    expect(list.status).toBe(200);
    const notification = (list.body as NotificationResponse[]).find((n) =>
      n.dedupeKey.includes(document.id),
    );
    expect(notification).toBeDefined();
    expect(notification?.isRead).toBe(false);

    const read = await markRead(token, notification!.id);
    expect(read.status).toBe(200);
    expect((read.body as NotificationResponse).isRead).toBe(true);
    expect((read.body as NotificationResponse).readAt).not.toBeNull();

    const allRead = await markAllRead(token);
    expect(allRead.status).toBe(204);

    const afterAllRead = await listNotifications(token);
    expect((afterAllRead.body as NotificationResponse[]).every((n) => n.isRead)).toBe(true);
  });

  it('família/usuário diferente não consegue marcar como lida a notificação de outra família (404)', async () => {
    const owner = await setupFamily('tenant-a');
    const intruder = await setupFamily('tenant-b');

    const document = await prisma.document.create({
      data: {
        familyId: owner.familyId,
        storageKey: `test/${randomUUID()}.ofx`,
        originalName: 'tenant.ofx',
        mimeType: 'application/x-ofx',
        sizeBytes: 100,
        status: 'PENDING',
        createdAt: new Date(Date.now() - 25 * ONE_DAY_MS),
      },
    });
    await checker.runChecks();

    const ownerList = await listNotifications(owner.token);
    const notification = (ownerList.body as NotificationResponse[]).find((n) =>
      n.dedupeKey.includes(document.id),
    );
    expect(notification).toBeDefined();

    const intruderList = await listNotifications(intruder.token);
    expect(
      (intruderList.body as NotificationResponse[]).some((n) => n.id === notification!.id),
    ).toBe(false);

    const readAsIntruder = await markRead(intruder.token, notification!.id);
    expect(readAsIntruder.status).toBe(404);
  });
});
