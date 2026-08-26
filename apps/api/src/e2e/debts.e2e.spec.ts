import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { PrismaModule, PrismaService } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { DebtsModule } from '../debts/debts.module';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';

process.env.DATABASE_URL =
  'postgresql://gotardo_test:gotardo_test@localhost:5433/gotardo_test?schema=public';
process.env.JWT_ACCESS_SECRET = 'e2e-jwt-secret';
process.env.JWT_ACCESS_TTL = '15m';
process.env.JWT_REFRESH_TTL = '30d';

type TokensResponse = { accessToken: string; refreshToken: string };
type MeResponse = { id: string; email: string; role: string; familyId: string };

type DebtResponse = {
  id: string;
  name: string;
  creditor: string | null;
  totalAmount: string;
  interestRate: string | null;
  installmentAmount: string | null;
  dueDay: number | null;
  status: string;
  paidAmount: string;
  remainingAmount: string;
};

type DebtPaymentResponse = {
  id: string;
  amount: string;
  date: string;
  note: string | null;
};

describe('Dívidas (e2e)', () => {
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

  const createDebt = (token: string, body: Record<string, unknown>) =>
    request(app.getHttpServer())
      .post('/api/v1/debts')
      .set('Authorization', `Bearer ${token}`)
      .send(body);

  const getDebt = (token: string, id: string) =>
    request(app.getHttpServer())
      .get(`/api/v1/debts/${id}`)
      .set('Authorization', `Bearer ${token}`);

  const listDebts = (token: string) =>
    request(app.getHttpServer()).get('/api/v1/debts').set('Authorization', `Bearer ${token}`);

  const updateDebt = (token: string, id: string, body: Record<string, unknown>) =>
    request(app.getHttpServer())
      .patch(`/api/v1/debts/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .send(body);

  const deleteDebt = (token: string, id: string) =>
    request(app.getHttpServer())
      .delete(`/api/v1/debts/${id}`)
      .set('Authorization', `Bearer ${token}`);

  const addPayment = (token: string, id: string, body: Record<string, unknown>) =>
    request(app.getHttpServer())
      .post(`/api/v1/debts/${id}/payments`)
      .set('Authorization', `Bearer ${token}`)
      .send(body);

  const listPayments = (token: string, id: string) =>
    request(app.getHttpServer())
      .get(`/api/v1/debts/${id}/payments`)
      .set('Authorization', `Bearer ${token}`);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), PrismaModule, AuthModule, DebtsModule],
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
      prisma.debtPayment.deleteMany({ where: { debt: { familyId: { in: createdFamilies } } } }),
      prisma.debt.deleteMany({ where: { familyId: { in: createdFamilies } } }),
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

  it('cria, lista, busca, atualiza e remove (soft delete) uma dívida', async () => {
    const { token } = await setupFamily('crud');

    const created = await createDebt(token, {
      name: 'Financiamento do carro',
      creditor: 'Banco XPTO',
      totalAmount: 20000,
      interestRate: 1.5,
      installmentAmount: 500,
      dueDay: 10,
    });
    expect(created.status).toBe(201);
    const debt = created.body as DebtResponse;
    expect(debt.name).toBe('Financiamento do carro');
    expect(debt.creditor).toBe('Banco XPTO');
    expect(debt.totalAmount).toBe('20000');
    expect(debt.status).toBe('ACTIVE');
    expect(debt.paidAmount).toBe('0');
    expect(debt.remainingAmount).toBe('20000');

    const fetched = await getDebt(token, debt.id);
    expect(fetched.status).toBe(200);
    expect((fetched.body as DebtResponse).id).toBe(debt.id);

    const list = await listDebts(token);
    expect(list.status).toBe(200);
    expect((list.body as DebtResponse[]).some((d) => d.id === debt.id)).toBe(true);

    const updated = await updateDebt(token, debt.id, {
      name: 'Financiamento do carro (renegociado)',
      status: 'PAID_OFF',
    });
    expect(updated.status).toBe(200);
    expect((updated.body as DebtResponse).name).toBe('Financiamento do carro (renegociado)');
    expect((updated.body as DebtResponse).status).toBe('PAID_OFF');

    const removed = await deleteDebt(token, debt.id);
    expect(removed.status).toBe(204);

    const afterDelete = await getDebt(token, debt.id);
    expect(afterDelete.status).toBe(404);

    const listAfterDelete = await listDebts(token);
    expect((listAfterDelete.body as DebtResponse[]).some((d) => d.id === debt.id)).toBe(false);
  });

  it('família diferente não consegue ver dívida de outra família (404)', async () => {
    const owner = await setupFamily('tenant-a');
    const intruder = await setupFamily('tenant-b');

    const created = await createDebt(owner.token, { name: 'Cartão de crédito', totalAmount: 3000 });
    const debtId = (created.body as DebtResponse).id;

    const asOwner = await getDebt(owner.token, debtId);
    expect(asOwner.status).toBe(200);

    const asIntruder = await getDebt(intruder.token, debtId);
    expect(asIntruder.status).toBe(404);

    const updateAsIntruder = await updateDebt(intruder.token, debtId, { name: 'Hackeado' });
    expect(updateAsIntruder.status).toBe(404);

    const deleteAsIntruder = await deleteDebt(intruder.token, debtId);
    expect(deleteAsIntruder.status).toBe(404);

    const addPaymentAsIntruder = await addPayment(intruder.token, debtId, { amount: 10 });
    expect(addPaymentAsIntruder.status).toBe(404);

    const listPaymentsAsIntruder = await listPayments(intruder.token, debtId);
    expect(listPaymentsAsIntruder.status).toBe(404);
  });

  it('calcula paidAmount e remainingAmount a partir dos pagamentos', async () => {
    const { token } = await setupFamily('progress');

    const created = await createDebt(token, { name: 'Empréstimo pessoal', totalAmount: 1000 });
    const debtId = (created.body as DebtResponse).id;

    const payment1 = await addPayment(token, debtId, { amount: 300, note: 'Pagamento 1' });
    expect(payment1.status).toBe(201);
    const payment2 = await addPayment(token, debtId, { amount: 200, note: 'Pagamento 2' });
    expect(payment2.status).toBe(201);

    const fetched = await getDebt(token, debtId);
    expect(fetched.status).toBe(200);
    const body = fetched.body as DebtResponse;
    expect(body.paidAmount).toBe('500');
    expect(body.remainingAmount).toBe('500');

    const payments = await listPayments(token, debtId);
    expect(payments.status).toBe(200);
    expect(payments.body as DebtPaymentResponse[]).toHaveLength(2);
    // Ordenado por data desc: pagamento mais recente primeiro (ambos sem
    // `date` explícita, então usam `now()` no momento da criação).
    const paymentBodies = payments.body as DebtPaymentResponse[];
    expect(new Date(paymentBodies[0]!.date).getTime()).toBeGreaterThanOrEqual(
      new Date(paymentBodies[1]!.date).getTime(),
    );
  });

  it('remainingAmount não fica negativo mesmo quando os pagamentos excedem o total (overpay)', async () => {
    const { token } = await setupFamily('overpay');

    const created = await createDebt(token, { name: 'Dívida pequena', totalAmount: 100 });
    const debtId = (created.body as DebtResponse).id;

    const payment = await addPayment(token, debtId, { amount: 150 });
    expect(payment.status).toBe(201);

    const fetched = await getDebt(token, debtId);
    const body = fetched.body as DebtResponse;
    expect(body.paidAmount).toBe('150');
    expect(body.remainingAmount).toBe('0');

    const list = await listDebts(token);
    const listed = (list.body as DebtResponse[]).find((d) => d.id === debtId);
    expect(listed?.remainingAmount).toBe('0');
  });

  it('soft delete: histórico de pagamentos da dívida não fica órfão nem quebra a API', async () => {
    const { token } = await setupFamily('soft-delete-payments');

    const created = await createDebt(token, { name: 'Dívida a remover', totalAmount: 500 });
    const debtId = (created.body as DebtResponse).id;

    const payment = await addPayment(token, debtId, { amount: 50 });
    expect(payment.status).toBe(201);

    const removed = await deleteDebt(token, debtId);
    expect(removed.status).toBe(204);

    const afterDelete = await getDebt(token, debtId);
    expect(afterDelete.status).toBe(404);

    const listAfterDelete = await listDebts(token);
    expect((listAfterDelete.body as DebtResponse[]).some((d) => d.id === debtId)).toBe(false);

    const paymentsAfterDelete = await listPayments(token, debtId);
    expect(paymentsAfterDelete.status).toBe(404);

    const dbPayments = await prisma.debtPayment.findMany({ where: { debtId } });
    expect(dbPayments).toHaveLength(1);
  });

  it('aceita interestRate 0 (parcelamento sem juros) e rejeita valores acima do teto da coluna', async () => {
    const { token } = await setupFamily('interest-rate-bounds');

    const zeroRate = await createDebt(token, {
      name: 'Parcelamento sem juros',
      totalAmount: 1000,
      interestRate: 0,
    });
    expect(zeroRate.status).toBe(201);
    expect((zeroRate.body as DebtResponse & { interestRate: string }).interestRate).toBe('0');

    const tooHighRate = await createDebt(token, {
      name: 'Dívida com juros inválidos',
      totalAmount: 1000,
      interestRate: 1234.56,
    });
    expect(tooHighRate.status).toBe(400);

    const tooHighTotal = await createDebt(token, {
      name: 'Dívida com valor inválido',
      totalAmount: 99_999_999_999_999,
    });
    expect(tooHighTotal.status).toBe(400);
  });
});
