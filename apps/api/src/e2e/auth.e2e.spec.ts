import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { PrismaModule, PrismaService } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { FamilyModule } from '../family/family.module';
import { AccountsModule } from '../accounts/accounts.module';
import { CategoriesModule } from '../categories/categories.module';
import { TransactionsModule } from '../transactions/transactions.module';
import { EnvelopesModule } from '../envelopes/envelopes.module';
import { ReportsModule } from '../reports/reports.module';
import { HealthModule } from '../health/health.module';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';

process.env.DATABASE_URL = 'postgresql://gotardo_test:gotardo_test@localhost:5433/gotardo_test?schema=public';
process.env.JWT_ACCESS_SECRET = 'e2e-jwt-secret';
process.env.JWT_ACCESS_TTL = '15m';
process.env.JWT_REFRESH_TTL = '30d';

type TokensResponse = { accessToken: string; refreshToken: string; expiresIn: number };
type MeResponse = {
  id: string;
  email: string;
  name: string;
  role: string;
  familyId: string;
  family: { id: string; name: string; currency: string };
};
type AccountResponse = { id: string; name: string; type: string };

describe('Auth e isolamento de tenant (e2e)', () => {
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

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        PrismaModule,
        AuthModule,
        FamilyModule,
        AccountsModule,
        CategoriesModule,
        TransactionsModule,
        EnvelopesModule,
        ReportsModule,
        HealthModule,
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
  });

  afterAll(async () => {
    if (createdFamilies.length > 0) {
      await prisma.transaction.deleteMany({ where: { familyId: { in: createdFamilies } } });
      await prisma.envelopeAllocation.deleteMany({
        where: { envelope: { familyId: { in: createdFamilies } } },
      });
      await prisma.envelope.deleteMany({ where: { familyId: { in: createdFamilies } } });
      await prisma.account.deleteMany({ where: { familyId: { in: createdFamilies } } });
      await prisma.category.deleteMany({ where: { familyId: { in: createdFamilies } } });
      await prisma.invitation.deleteMany({ where: { familyId: { in: createdFamilies } } });
      await prisma.refreshToken.deleteMany({
        where: { user: { familyId: { in: createdFamilies } } },
      });
      await prisma.user.deleteMany({ where: { familyId: { in: createdFamilies } } });
      await prisma.family.deleteMany({ where: { id: { in: createdFamilies } } });
    }
    await app.close();
  });

  it('health é público', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/health');
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('ok');
  });

  it('rota protegida sem token retorna 401', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/auth/me');
    expect(res.status).toBe(401);
  });

  it('registro cria família e usuário OWNER, e /me retorna os dados', async () => {
    const email = emailFor('owner-a');
    const reg = await register('Owner A', email, `Família A ${suffix}`);
    expect(reg.status).toBe(201);
    const tokens = reg.body as TokensResponse;
    expect(tokens.accessToken).toBeDefined();
    expect(tokens.refreshToken).toBeDefined();

    const meRes = await me(tokens.accessToken);
    expect(meRes.status).toBe(200);
    const data = meRes.body as MeResponse;
    expect(data.email).toBe(email);
    expect(data.role).toBe('OWNER');
    expect(data.family.name).toBe(`Família A ${suffix}`);
    createdFamilies.push(data.familyId);
  });

  it('login com senha errada retorna 401', async () => {
    const email = emailFor('owner-b');
    await register('Owner B', email, `Família B ${suffix}`);
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password: 'senha-errada-xyz' });
    expect(res.status).toBe(401);
  });

  it('login correto retorna tokens e refresh faz rotação', async () => {
    const email = emailFor('owner-c');
    const reg = await register('Owner C', email, `Família C ${suffix}`);
    const firstTokens = reg.body as TokensResponse;

    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password: 'senha-segura-123' });
    expect(login.status).toBe(200);
    const loginTokens = login.body as TokensResponse;

    const meAfterLogin = await me(loginTokens.accessToken);
    expect(meAfterLogin.status).toBe(200);
    createdFamilies.push((meAfterLogin.body as MeResponse).familyId);

    const refresh = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: loginTokens.refreshToken });
    expect(refresh.status).toBe(200);
    const rotated = refresh.body as TokensResponse;
    expect(rotated.accessToken).toBeDefined();
    expect(rotated.refreshToken).not.toBe(loginTokens.refreshToken);

    const reuse = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: loginTokens.refreshToken });
    expect(reuse.status).toBe(401);

    const rotatedReuse = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: rotated.refreshToken });
    expect(rotatedReuse.status).toBe(200);
    expect(firstTokens.refreshToken).toBeDefined();
  });

  it('um tenant não enxerga nem acessa contas de outro tenant', async () => {
    const emailA = emailFor('iso-a');
    const regA = await register('Iso A', emailA, `Família Iso A ${suffix}`);
    const tokensA = regA.body as TokensResponse;
    const meA = await me(tokensA.accessToken);
    const familyA = (meA.body as MeResponse).familyId;
    createdFamilies.push(familyA);

    const createA = await request(app.getHttpServer())
      .post('/api/v1/accounts')
      .set('Authorization', `Bearer ${tokensA.accessToken}`)
      .send({ name: 'Conta Corrente A' });
    expect(createA.status).toBe(201);
    const accountA = createA.body as AccountResponse;

    const emailB = emailFor('iso-b');
    const regB = await register('Iso B', emailB, `Família Iso B ${suffix}`);
    const tokensB = regB.body as TokensResponse;
    const meB = await me(tokensB.accessToken);
    createdFamilies.push((meB.body as MeResponse).familyId);

    const listB = await request(app.getHttpServer())
      .get('/api/v1/accounts')
      .set('Authorization', `Bearer ${tokensB.accessToken}`);
    expect(listB.status).toBe(200);
    expect(listB.body).toHaveLength(0);

    const getB = await request(app.getHttpServer())
      .get(`/api/v1/accounts/${accountA.id}`)
      .set('Authorization', `Bearer ${tokensB.accessToken}`);
    expect(getB.status).toBe(404);

    const patchB = await request(app.getHttpServer())
      .patch(`/api/v1/accounts/${accountA.id}`)
      .set('Authorization', `Bearer ${tokensB.accessToken}`)
      .send({ name: 'Invadido' });
    expect(patchB.status).toBe(404);

    const delB = await request(app.getHttpServer())
      .delete(`/api/v1/accounts/${accountA.id}`)
      .set('Authorization', `Bearer ${tokensB.accessToken}`);
    expect(delB.status).toBe(404);

    const stillThere = await request(app.getHttpServer())
      .get(`/api/v1/accounts/${accountA.id}`)
      .set('Authorization', `Bearer ${tokensA.accessToken}`);
    expect(stillThere.status).toBe(200);
  });

  it('convite: OWNER convida, convidado aceita e entra como MEMBER; papéis mudam', async () => {
    const emailOwner = emailFor('inv-owner');
    const regOwner = await register('Inv Owner', emailOwner, `Família Inv ${suffix}`);
    const tokensOwner = regOwner.body as TokensResponse;
    const meOwner = await me(tokensOwner.accessToken);
    createdFamilies.push((meOwner.body as MeResponse).familyId);

    const inviteEmail = emailFor('inv-member');
    const invite = await request(app.getHttpServer())
      .post('/api/v1/family/invitations')
      .set('Authorization', `Bearer ${tokensOwner.accessToken}`)
      .send({ email: inviteEmail });
    expect(invite.status).toBe(201);
    const { inviteToken } = invite.body as { inviteToken: string };

    const accept = await request(app.getHttpServer())
      .post('/api/v1/auth/accept-invitation')
      .send({ token: inviteToken, name: 'Inv Member', password: 'senha-segura-123' });
    expect(accept.status).toBe(200);
    const tokensMember = accept.body as TokensResponse;

    const meMember = await me(tokensMember.accessToken);
    const memberData = meMember.body as MeResponse;
    expect(memberData.role).toBe('MEMBER');
    expect(memberData.familyId).toBe((meOwner.body as MeResponse).familyId);

    const memberChangeRole = await request(app.getHttpServer())
      .patch(`/api/v1/family/members/${memberData.id}/role`)
      .set('Authorization', `Bearer ${tokensMember.accessToken}`)
      .send({ role: 'OWNER' });
    expect(memberChangeRole.status).toBe(403);

    const ownerChangeRole = await request(app.getHttpServer())
      .patch(`/api/v1/family/members/${memberData.id}/role`)
      .set('Authorization', `Bearer ${tokensOwner.accessToken}`)
      .send({ role: 'ADMIN' });
    expect(ownerChangeRole.status).toBe(200);
  });

  it('ADMIN não pode conceder OWNER nem convidar como OWNER', async () => {
    const emailOwner = emailFor('esc-owner');
    const regOwner = await register('Esc Owner', emailOwner, `Família Esc ${suffix}`);
    const tokensOwner = regOwner.body as TokensResponse;
    const meOwner = await me(tokensOwner.accessToken);
    createdFamilies.push((meOwner.body as MeResponse).familyId);

    const inviteAdmin = await request(app.getHttpServer())
      .post('/api/v1/family/invitations')
      .set('Authorization', `Bearer ${tokensOwner.accessToken}`)
      .send({ email: emailFor('esc-admin'), role: 'ADMIN' });
    expect(inviteAdmin.status).toBe(201);
    const acceptAdmin = await request(app.getHttpServer())
      .post('/api/v1/auth/accept-invitation')
      .send({
        token: (inviteAdmin.body as { inviteToken: string }).inviteToken,
        name: 'Esc Admin',
        password: 'senha-segura-123',
      });
    const tokensAdmin = acceptAdmin.body as TokensResponse;
    const meAdmin = await me(tokensAdmin.accessToken);
    expect((meAdmin.body as MeResponse).role).toBe('ADMIN');

    const inviteMember = await request(app.getHttpServer())
      .post('/api/v1/family/invitations')
      .set('Authorization', `Bearer ${tokensOwner.accessToken}`)
      .send({ email: emailFor('esc-member') });
    expect(inviteMember.status).toBe(201);
    const acceptMember = await request(app.getHttpServer())
      .post('/api/v1/auth/accept-invitation')
      .send({
        token: (inviteMember.body as { inviteToken: string }).inviteToken,
        name: 'Esc Member',
        password: 'senha-segura-123',
      });
    const tokensMember = acceptMember.body as TokensResponse;
    const meMember = await me(tokensMember.accessToken);
    const memberId = (meMember.body as MeResponse).id;

    const grantOwner = await request(app.getHttpServer())
      .patch(`/api/v1/family/members/${memberId}/role`)
      .set('Authorization', `Bearer ${tokensAdmin.accessToken}`)
      .send({ role: 'OWNER' });
    expect(grantOwner.status).toBe(403);

    const inviteAsOwner = await request(app.getHttpServer())
      .post('/api/v1/family/invitations')
      .set('Authorization', `Bearer ${tokensAdmin.accessToken}`)
      .send({ email: emailFor('esc-invited-owner'), role: 'OWNER' });
    expect(inviteAsOwner.status).toBe(403);

    const ownerGrants = await request(app.getHttpServer())
      .patch(`/api/v1/family/members/${memberId}/role`)
      .set('Authorization', `Bearer ${tokensOwner.accessToken}`)
      .send({ role: 'OWNER' });
    expect(ownerGrants.status).toBe(200);
  });

  it('categorias: CRUD hierárquico, isolamento e restrições de ciclo', async () => {
    const emailA = emailFor('cat-a');
    const regA = await register('Cat A', emailA, `Família Cat A ${suffix}`);
    const tokensA = regA.body as TokensResponse;
    const meA = await me(tokensA.accessToken);
    createdFamilies.push((meA.body as MeResponse).familyId);

    const createRoot = await request(app.getHttpServer())
      .post('/api/v1/categories')
      .set('Authorization', `Bearer ${tokensA.accessToken}`)
      .send({ name: 'Alimentação', icon: '🍔' });
    expect(createRoot.status).toBe(201);
    const root = createRoot.body as { id: string; name: string; parentId: string | null };

    const createChild = await request(app.getHttpServer())
      .post('/api/v1/categories')
      .set('Authorization', `Bearer ${tokensA.accessToken}`)
      .send({ name: 'Restaurantes', parentId: root.id });
    expect(createChild.status).toBe(201);
    const child = createChild.body as { id: string; parentId: string | null };
    expect(child.parentId).toBe(root.id);

    const list = await request(app.getHttpServer())
      .get('/api/v1/categories')
      .set('Authorization', `Bearer ${tokensA.accessToken}`);
    expect(list.status).toBe(200);
    expect(list.body as { id: string }[]).toHaveLength(2);

    const patchName = await request(app.getHttpServer())
      .patch(`/api/v1/categories/${child.id}`)
      .set('Authorization', `Bearer ${tokensA.accessToken}`)
      .send({ name: 'Lanchonetes' });
    expect(patchName.status).toBe(200);
    expect((patchName.body as { name: string }).name).toBe('Lanchonetes');

    const selfParent = await request(app.getHttpServer())
      .patch(`/api/v1/categories/${child.id}`)
      .set('Authorization', `Bearer ${tokensA.accessToken}`)
      .send({ parentId: child.id });
    expect(selfParent.status).toBe(400);

    const cycle = await request(app.getHttpServer())
      .patch(`/api/v1/categories/${root.id}`)
      .set('Authorization', `Bearer ${tokensA.accessToken}`)
      .send({ parentId: child.id });
    expect(cycle.status).toBe(400);

    const deleteWithChildren = await request(app.getHttpServer())
      .delete(`/api/v1/categories/${root.id}`)
      .set('Authorization', `Bearer ${tokensA.accessToken}`);
    expect(deleteWithChildren.status).toBe(409);

    const crossTenant = await request(app.getHttpServer())
      .get(`/api/v1/categories/${child.id}`)
      .set('Authorization', `Bearer ${tokensA.accessToken}`);
    expect(crossTenant.status).toBe(200);

    const emailB = emailFor('cat-b');
    const regB = await register('Cat B', emailB, `Família Cat B ${suffix}`);
    const tokensB = regB.body as TokensResponse;
    const meB = await me(tokensB.accessToken);
    createdFamilies.push((meB.body as MeResponse).familyId);

    const listB = await request(app.getHttpServer())
      .get('/api/v1/categories')
      .set('Authorization', `Bearer ${tokensB.accessToken}`);
    expect(listB.status).toBe(200);
    expect(listB.body).toHaveLength(0);

    const getB = await request(app.getHttpServer())
      .get(`/api/v1/categories/${root.id}`)
      .set('Authorization', `Bearer ${tokensB.accessToken}`);
    expect(getB.status).toBe(404);

    const createWithForeignParent = await request(app.getHttpServer())
      .post('/api/v1/categories')
      .set('Authorization', `Bearer ${tokensB.accessToken}`)
      .send({ name: 'Invasora', parentId: root.id });
    expect(createWithForeignParent.status).toBe(404);

    const deleteChild = await request(app.getHttpServer())
      .delete(`/api/v1/categories/${child.id}`)
      .set('Authorization', `Bearer ${tokensA.accessToken}`);
    expect(deleteChild.status).toBe(204);

    const deleteRoot = await request(app.getHttpServer())
      .delete(`/api/v1/categories/${root.id}`)
      .set('Authorization', `Bearer ${tokensA.accessToken}`);
    expect(deleteRoot.status).toBe(204);
  });

  it('MEMBER lê contas e categorias mas não escreve', async () => {
    const emailOwner = emailFor('perm-owner');
    const regOwner = await register('Perm Owner', emailOwner, `Família Perm ${suffix}`);
    const tokensOwner = regOwner.body as TokensResponse;
    const meOwner = await me(tokensOwner.accessToken);
    createdFamilies.push((meOwner.body as MeResponse).familyId);

    const account = await request(app.getHttpServer())
      .post('/api/v1/accounts')
      .set('Authorization', `Bearer ${tokensOwner.accessToken}`)
      .send({ name: 'Conta Perm' });
    expect(account.status).toBe(201);
    const accountId = (account.body as { id: string }).id;

    const category = await request(app.getHttpServer())
      .post('/api/v1/categories')
      .set('Authorization', `Bearer ${tokensOwner.accessToken}`)
      .send({ name: 'Categoria Perm' });
    expect(category.status).toBe(201);
    const categoryId = (category.body as { id: string }).id;

    const invite = await request(app.getHttpServer())
      .post('/api/v1/family/invitations')
      .set('Authorization', `Bearer ${tokensOwner.accessToken}`)
      .send({ email: emailFor('perm-member') });
    expect(invite.status).toBe(201);
    const accept = await request(app.getHttpServer())
      .post('/api/v1/auth/accept-invitation')
      .send({
        token: (invite.body as { inviteToken: string }).inviteToken,
        name: 'Perm Member',
        password: 'senha-segura-123',
      });
    const tokensMember = accept.body as TokensResponse;

    const memberListAccounts = await request(app.getHttpServer())
      .get('/api/v1/accounts')
      .set('Authorization', `Bearer ${tokensMember.accessToken}`);
    expect(memberListAccounts.status).toBe(200);
    expect(memberListAccounts.body as { id: string }[]).toHaveLength(1);

    const memberGetAccount = await request(app.getHttpServer())
      .get(`/api/v1/accounts/${accountId}`)
      .set('Authorization', `Bearer ${tokensMember.accessToken}`);
    expect(memberGetAccount.status).toBe(200);

    const memberCreateAccount = await request(app.getHttpServer())
      .post('/api/v1/accounts')
      .set('Authorization', `Bearer ${tokensMember.accessToken}`)
      .send({ name: 'Invadida' });
    expect(memberCreateAccount.status).toBe(403);

    const memberPatchAccount = await request(app.getHttpServer())
      .patch(`/api/v1/accounts/${accountId}`)
      .set('Authorization', `Bearer ${tokensMember.accessToken}`)
      .send({ name: 'Invadida' });
    expect(memberPatchAccount.status).toBe(403);

    const memberDeleteAccount = await request(app.getHttpServer())
      .delete(`/api/v1/accounts/${accountId}`)
      .set('Authorization', `Bearer ${tokensMember.accessToken}`);
    expect(memberDeleteAccount.status).toBe(403);

    const memberListCategories = await request(app.getHttpServer())
      .get('/api/v1/categories')
      .set('Authorization', `Bearer ${tokensMember.accessToken}`);
    expect(memberListCategories.status).toBe(200);

    const memberCreateCategory = await request(app.getHttpServer())
      .post('/api/v1/categories')
      .set('Authorization', `Bearer ${tokensMember.accessToken}`)
      .send({ name: 'Invadida' });
    expect(memberCreateCategory.status).toBe(403);

    const memberPatchCategory = await request(app.getHttpServer())
      .patch(`/api/v1/categories/${categoryId}`)
      .set('Authorization', `Bearer ${tokensMember.accessToken}`)
      .send({ name: 'Invadida' });
    expect(memberPatchCategory.status).toBe(403);
  });

  it('transações: saldo da conta acompanha confirmação, edição e exclusão', async () => {
    const email = emailFor('tx-a');
    const reg = await register('Tx A', email, `Família Tx A ${suffix}`);
    const tokens = reg.body as TokensResponse;
    const meRes = await me(tokens.accessToken);
    createdFamilies.push((meRes.body as MeResponse).familyId);

    const createAccount = await request(app.getHttpServer())
      .post('/api/v1/accounts')
      .set('Authorization', `Bearer ${tokens.accessToken}`)
      .send({ name: 'Conta Tx' });
    expect(createAccount.status).toBe(201);
    const accountId = (createAccount.body as { id: string }).id;

    const createCategory = await request(app.getHttpServer())
      .post('/api/v1/categories')
      .set('Authorization', `Bearer ${tokens.accessToken}`)
      .send({ name: 'Alimentação Tx' });
    expect(createCategory.status).toBe(201);
    const categoryId = (createCategory.body as { id: string }).id;

    const getBalance = async (): Promise<string> => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/accounts/${accountId}`)
        .set('Authorization', `Bearer ${tokens.accessToken}`);
      return (res.body as { balance: string }).balance;
    };

    expect(await getBalance()).toBe('0');

    const createExpense = await request(app.getHttpServer())
      .post('/api/v1/transactions')
      .set('Authorization', `Bearer ${tokens.accessToken}`)
      .send({
        accountId,
        categoryId,
        description: 'Mercado',
        amount: 50,
        type: 'EXPENSE',
        status: 'CONFIRMED',
        date: '2026-08-01T00:00:00.000Z',
      });
    expect(createExpense.status).toBe(201);
    const expenseId = (createExpense.body as { id: string }).id;
    expect((createExpense.body as { category: { id: string } | null }).category?.id).toBe(
      categoryId,
    );
    expect(await getBalance()).toBe('-50');

    const createPending = await request(app.getHttpServer())
      .post('/api/v1/transactions')
      .set('Authorization', `Bearer ${tokens.accessToken}`)
      .send({ accountId, description: 'Salário', amount: 200, type: 'INCOME' });
    expect(createPending.status).toBe(201);
    const incomeId = (createPending.body as { id: string }).id;
    expect((createPending.body as { status: string }).status).toBe('PENDING');
    expect(await getBalance()).toBe('-50');

    const confirm = await request(app.getHttpServer())
      .patch(`/api/v1/transactions/${incomeId}`)
      .set('Authorization', `Bearer ${tokens.accessToken}`)
      .send({ status: 'CONFIRMED' });
    expect(confirm.status).toBe(200);
    expect(await getBalance()).toBe('150');

    const editAmount = await request(app.getHttpServer())
      .patch(`/api/v1/transactions/${incomeId}`)
      .set('Authorization', `Bearer ${tokens.accessToken}`)
      .send({ amount: 100 });
    expect(editAmount.status).toBe(200);
    expect(await getBalance()).toBe('50');

    const remove = await request(app.getHttpServer())
      .delete(`/api/v1/transactions/${expenseId}`)
      .set('Authorization', `Bearer ${tokens.accessToken}`);
    expect(remove.status).toBe(204);
    expect(await getBalance()).toBe('100');

    const list = await request(app.getHttpServer())
      .get('/api/v1/transactions')
      .set('Authorization', `Bearer ${tokens.accessToken}`);
    expect(list.status).toBe(200);
    expect(list.body as { id: string }[]).toHaveLength(1);
  });

  it('transações: isolamento entre tenants', async () => {
    const emailA = emailFor('txi-a');
    const regA = await register('Txi A', emailA, `Família Txi A ${suffix}`);
    const tokensA = regA.body as TokensResponse;
    const meA = await me(tokensA.accessToken);
    createdFamilies.push((meA.body as MeResponse).familyId);

    const accA = await request(app.getHttpServer())
      .post('/api/v1/accounts')
      .set('Authorization', `Bearer ${tokensA.accessToken}`)
      .send({ name: 'Conta Txi A' });
    expect(accA.status).toBe(201);
    const accountA = (accA.body as { id: string }).id;

    const tx = await request(app.getHttpServer())
      .post('/api/v1/transactions')
      .set('Authorization', `Bearer ${tokensA.accessToken}`)
      .send({
        accountId: accountA,
        description: 'Padaria',
        amount: 10,
        type: 'EXPENSE',
        status: 'CONFIRMED',
      });
    expect(tx.status).toBe(201);
    const txId = (tx.body as { id: string }).id;

    const emailB = emailFor('txi-b');
    const regB = await register('Txi B', emailB, `Família Txi B ${suffix}`);
    const tokensB = regB.body as TokensResponse;
    const meB = await me(tokensB.accessToken);
    createdFamilies.push((meB.body as MeResponse).familyId);

    const listB = await request(app.getHttpServer())
      .get('/api/v1/transactions')
      .set('Authorization', `Bearer ${tokensB.accessToken}`);
    expect(listB.status).toBe(200);
    expect(listB.body).toHaveLength(0);

    const getB = await request(app.getHttpServer())
      .get(`/api/v1/transactions/${txId}`)
      .set('Authorization', `Bearer ${tokensB.accessToken}`);
    expect(getB.status).toBe(404);

    const createWithForeignAccount = await request(app.getHttpServer())
      .post('/api/v1/transactions')
      .set('Authorization', `Bearer ${tokensB.accessToken}`)
      .send({ accountId: accountA, description: 'Invasão', amount: 1, type: 'EXPENSE' });
    expect(createWithForeignAccount.status).toBe(404);

    const patchB = await request(app.getHttpServer())
      .patch(`/api/v1/transactions/${txId}`)
      .set('Authorization', `Bearer ${tokensB.accessToken}`)
      .send({ description: 'Invasão' });
    expect(patchB.status).toBe(404);
  });

  it('MEMBER lê transações mas não cria', async () => {
    const emailOwner = emailFor('tpm-owner');
    const regOwner = await register('Tpm Owner', emailOwner, `Família Tpm ${suffix}`);
    const tokensOwner = regOwner.body as TokensResponse;
    const meOwner = await me(tokensOwner.accessToken);
    createdFamilies.push((meOwner.body as MeResponse).familyId);

    const acc = await request(app.getHttpServer())
      .post('/api/v1/accounts')
      .set('Authorization', `Bearer ${tokensOwner.accessToken}`)
      .send({ name: 'Conta Tpm' });
    const accountId = (acc.body as { id: string }).id;

    const invite = await request(app.getHttpServer())
      .post('/api/v1/family/invitations')
      .set('Authorization', `Bearer ${tokensOwner.accessToken}`)
      .send({ email: emailFor('tpm-member') });
    const accept = await request(app.getHttpServer())
      .post('/api/v1/auth/accept-invitation')
      .send({
        token: (invite.body as { inviteToken: string }).inviteToken,
        name: 'Tpm Member',
        password: 'senha-segura-123',
      });
    const tokensMember = accept.body as TokensResponse;

    const memberList = await request(app.getHttpServer())
      .get('/api/v1/transactions')
      .set('Authorization', `Bearer ${tokensMember.accessToken}`);
    expect(memberList.status).toBe(200);

    const memberCreate = await request(app.getHttpServer())
      .post('/api/v1/transactions')
      .set('Authorization', `Bearer ${tokensMember.accessToken}`)
      .send({ accountId, description: 'Invasão', amount: 1, type: 'EXPENSE' });
    expect(memberCreate.status).toBe(403);
  });

  it('envelopes: CRUD, alocações e resumo alocado - gasto', async () => {
    const email = emailFor('env-a');
    const reg = await register('Env A', email, `Família Env A ${suffix}`);
    const tokens = reg.body as TokensResponse;
    const meRes = await me(tokens.accessToken);
    createdFamilies.push((meRes.body as MeResponse).familyId);

    const create = await request(app.getHttpServer())
      .post('/api/v1/envelopes')
      .set('Authorization', `Bearer ${tokens.accessToken}`)
      .send({ name: 'Mercado', icon: '🛒', targetAmount: 1000 });
    expect(create.status).toBe(201);
    const envelopeId = (create.body as { id: string }).id;
    expect((create.body as { balance: string }).balance).toBe('0');

    const allocate = await request(app.getHttpServer())
      .post(`/api/v1/envelopes/${envelopeId}/allocations`)
      .set('Authorization', `Bearer ${tokens.accessToken}`)
      .send({ amount: 500, note: 'Fundando o mês' });
    expect(allocate.status).toBe(201);

    const allocations = await request(app.getHttpServer())
      .get(`/api/v1/envelopes/${envelopeId}/allocations`)
      .set('Authorization', `Bearer ${tokens.accessToken}`);
    expect(allocations.status).toBe(200);
    expect(allocations.body).toHaveLength(1);

    const createAccount = await request(app.getHttpServer())
      .post('/api/v1/accounts')
      .set('Authorization', `Bearer ${tokens.accessToken}`)
      .send({ name: 'Conta Env' });
    const accountId = (createAccount.body as { id: string }).id;

    const createCategory = await request(app.getHttpServer())
      .post('/api/v1/categories')
      .set('Authorization', `Bearer ${tokens.accessToken}`)
      .send({ name: 'Alimentação Env' });
    const categoryId = (createCategory.body as { id: string }).id;

    const tx = await request(app.getHttpServer())
      .post('/api/v1/transactions')
      .set('Authorization', `Bearer ${tokens.accessToken}`)
      .send({
        accountId,
        categoryId,
        envelopeId,
        description: 'Mercado',
        amount: 120,
        type: 'EXPENSE',
        status: 'CONFIRMED',
      });
    expect(tx.status).toBe(201);

    const summary = await request(app.getHttpServer())
      .get(`/api/v1/envelopes/${envelopeId}`)
      .set('Authorization', `Bearer ${tokens.accessToken}`);
    expect(summary.status).toBe(200);
    const body = summary.body as { allocated: string; spent: string; balance: string };
    expect(body.allocated).toBe('500');
    expect(body.spent).toBe('120');
    expect(body.balance).toBe('380');

    const update = await request(app.getHttpServer())
      .patch(`/api/v1/envelopes/${envelopeId}`)
      .set('Authorization', `Bearer ${tokens.accessToken}`)
      .send({ targetAmount: 1200, isActive: false });
    expect(update.status).toBe(200);
    expect((update.body as { targetAmount: string }).targetAmount).toBe('1200');
    expect((update.body as { isActive: boolean }).isActive).toBe(false);

    const deleteWithTx = await request(app.getHttpServer())
      .delete(`/api/v1/envelopes/${envelopeId}`)
      .set('Authorization', `Bearer ${tokens.accessToken}`);
    expect(deleteWithTx.status).toBe(409);

    await request(app.getHttpServer())
      .delete(`/api/v1/transactions/${(tx.body as { id: string }).id}`)
      .set('Authorization', `Bearer ${tokens.accessToken}`);

    const deleteOk = await request(app.getHttpServer())
      .delete(`/api/v1/envelopes/${envelopeId}`)
      .set('Authorization', `Bearer ${tokens.accessToken}`);
    expect(deleteOk.status).toBe(204);
  });

  it('envelopes: isolamento entre tenants', async () => {
    const emailA = emailFor('envi-a');
    const regA = await register('Envi A', emailA, `Família Envi A ${suffix}`);
    const tokensA = regA.body as TokensResponse;
    const meA = await me(tokensA.accessToken);
    createdFamilies.push((meA.body as MeResponse).familyId);

    const env = await request(app.getHttpServer())
      .post('/api/v1/envelopes')
      .set('Authorization', `Bearer ${tokensA.accessToken}`)
      .send({ name: 'Envelope A' });
    expect(env.status).toBe(201);
    const envelopeId = (env.body as { id: string }).id;

    const emailB = emailFor('envi-b');
    const regB = await register('Envi B', emailB, `Família Envi B ${suffix}`);
    const tokensB = regB.body as TokensResponse;
    const meB = await me(tokensB.accessToken);
    createdFamilies.push((meB.body as MeResponse).familyId);

    const listB = await request(app.getHttpServer())
      .get('/api/v1/envelopes')
      .set('Authorization', `Bearer ${tokensB.accessToken}`);
    expect(listB.status).toBe(200);
    expect(listB.body).toHaveLength(0);

    const getB = await request(app.getHttpServer())
      .get(`/api/v1/envelopes/${envelopeId}`)
      .set('Authorization', `Bearer ${tokensB.accessToken}`);
    expect(getB.status).toBe(404);

    const allocateB = await request(app.getHttpServer())
      .post(`/api/v1/envelopes/${envelopeId}/allocations`)
      .set('Authorization', `Bearer ${tokensB.accessToken}`)
      .send({ amount: 1 });
    expect(allocateB.status).toBe(404);

    const patchB = await request(app.getHttpServer())
      .patch(`/api/v1/envelopes/${envelopeId}`)
      .set('Authorization', `Bearer ${tokensB.accessToken}`)
      .send({ name: 'Invasão' });
    expect(patchB.status).toBe(404);
  });

  it('MEMBER lê envelopes mas não cria nem aloca', async () => {
    const emailOwner = emailFor('epm-owner');
    const regOwner = await register('Epm Owner', emailOwner, `Família Epm ${suffix}`);
    const tokensOwner = regOwner.body as TokensResponse;
    const meOwner = await me(tokensOwner.accessToken);
    createdFamilies.push((meOwner.body as MeResponse).familyId);

    const env = await request(app.getHttpServer())
      .post('/api/v1/envelopes')
      .set('Authorization', `Bearer ${tokensOwner.accessToken}`)
      .send({ name: 'Envelope Epm' });
    const envelopeId = (env.body as { id: string }).id;

    const invite = await request(app.getHttpServer())
      .post('/api/v1/family/invitations')
      .set('Authorization', `Bearer ${tokensOwner.accessToken}`)
      .send({ email: emailFor('epm-member') });
    const accept = await request(app.getHttpServer())
      .post('/api/v1/auth/accept-invitation')
      .send({
        token: (invite.body as { inviteToken: string }).inviteToken,
        name: 'Epm Member',
        password: 'senha-segura-123',
      });
    const tokensMember = accept.body as TokensResponse;

    const memberList = await request(app.getHttpServer())
      .get('/api/v1/envelopes')
      .set('Authorization', `Bearer ${tokensMember.accessToken}`);
    expect(memberList.status).toBe(200);
    expect(memberList.body).toHaveLength(1);

    const memberCreate = await request(app.getHttpServer())
      .post('/api/v1/envelopes')
      .set('Authorization', `Bearer ${tokensMember.accessToken}`)
      .send({ name: 'Invasão' });
    expect(memberCreate.status).toBe(403);

    const memberAllocate = await request(app.getHttpServer())
      .post(`/api/v1/envelopes/${envelopeId}/allocations`)
      .set('Authorization', `Bearer ${tokensMember.accessToken}`)
      .send({ amount: 10 });
    expect(memberAllocate.status).toBe(403);
  });

  it('relatórios: fluxo de caixa, gastos por categoria e por envelope', async () => {
    const email = emailFor('rep-a');
    const reg = await register('Rep A', email, `Família Rep A ${suffix}`);
    const tokens = reg.body as TokensResponse;
    const meRes = await me(tokens.accessToken);
    createdFamilies.push((meRes.body as MeResponse).familyId);

    const acc = await request(app.getHttpServer())
      .post('/api/v1/accounts')
      .set('Authorization', `Bearer ${tokens.accessToken}`)
      .send({ name: 'Conta Rep' });
    const accountId = (acc.body as { id: string }).id;

    const catA = await request(app.getHttpServer())
      .post('/api/v1/categories')
      .set('Authorization', `Bearer ${tokens.accessToken}`)
      .send({ name: 'Moradia' });
    const catAId = (catA.body as { id: string }).id;
    const catB = await request(app.getHttpServer())
      .post('/api/v1/categories')
      .set('Authorization', `Bearer ${tokens.accessToken}`)
      .send({ name: 'Lazer' });
    const catBId = (catB.body as { id: string }).id;

    const envelope = await request(app.getHttpServer())
      .post('/api/v1/envelopes')
      .set('Authorization', `Bearer ${tokens.accessToken}`)
      .send({ name: 'Envelope Rep' });
    const envelopeId = (envelope.body as { id: string }).id;

    const createTx = (body: object) =>
      request(app.getHttpServer())
        .post('/api/v1/transactions')
        .set('Authorization', `Bearer ${tokens.accessToken}`)
        .send(body);

    await createTx({
      accountId,
      description: 'Salário',
      amount: 1000,
      type: 'INCOME',
      status: 'CONFIRMED',
      date: '2026-08-10T00:00:00.000Z',
    });
    await createTx({
      accountId,
      description: 'Aluguel',
      amount: 300,
      type: 'EXPENSE',
      status: 'CONFIRMED',
      date: '2026-08-15T00:00:00.000Z',
    });
    await createTx({
      accountId,
      categoryId: catAId,
      description: 'Conta de luz',
      amount: 100,
      type: 'EXPENSE',
      status: 'CONFIRMED',
      date: '2026-07-05T00:00:00.000Z',
    });
    await createTx({
      accountId,
      description: 'Pendente',
      amount: 500,
      type: 'INCOME',
      status: 'PENDING',
      date: '2026-08-20T00:00:00.000Z',
    });

    const cashflow = await request(app.getHttpServer())
      .get('/api/v1/reports/cashflow')
      .query({ from: '2026-08-01T00:00:00.000Z', to: '2026-08-31T23:59:59.000Z' })
      .set('Authorization', `Bearer ${tokens.accessToken}`);
    expect(cashflow.status).toBe(200);
    const cashflowBody = cashflow.body as {
      income: string;
      expense: string;
      net: string;
      byMonth: { month: string; income: string; expense: string; net: string }[];
    };
    expect(cashflowBody.income).toBe('1000');
    expect(cashflowBody.expense).toBe('300');
    expect(cashflowBody.net).toBe('700');
    expect(cashflowBody.byMonth).toHaveLength(1);
    expect(cashflowBody.byMonth[0]!.month).toBe('2026-08');
    expect(cashflowBody.byMonth[0]!.income).toBe('1000');
    expect(cashflowBody.byMonth[0]!.expense).toBe('300');

    await createTx({
      accountId,
      categoryId: catAId,
      description: 'Mercado',
      amount: 100,
      type: 'EXPENSE',
      status: 'CONFIRMED',
      date: '2026-08-01T00:00:00.000Z',
    });
    await createTx({
      accountId,
      categoryId: catBId,
      description: 'Cinema',
      amount: 50,
      type: 'EXPENSE',
      status: 'CONFIRMED',
      date: '2026-08-02T00:00:00.000Z',
    });
    await createTx({
      accountId,
      description: 'Sem categoria',
      amount: 25,
      type: 'EXPENSE',
      status: 'CONFIRMED',
      date: '2026-08-03T00:00:00.000Z',
    });

    const byCategory = await request(app.getHttpServer())
      .get('/api/v1/reports/expenses-by-category')
      .query({ from: '2026-08-01T00:00:00.000Z', to: '2026-08-31T23:59:59.000Z' })
      .set('Authorization', `Bearer ${tokens.accessToken}`);
    expect(byCategory.status).toBe(200);
    const catRows = byCategory.body as {
      categoryId: string | null;
      categoryName: string;
      total: string;
    }[];
    expect(catRows).toHaveLength(3);
    expect(catRows[0]!.categoryName).toBe('Sem categoria');
    expect(catRows[0]!.total).toBe('325');
    expect(catRows[1]!.categoryName).toBe('Moradia');
    expect(catRows[1]!.total).toBe('100');
    expect(catRows[2]!.categoryName).toBe('Lazer');
    expect(catRows[2]!.total).toBe('50');

    await createTx({
      accountId,
      envelopeId,
      description: 'Farmácia',
      amount: 80,
      type: 'EXPENSE',
      status: 'CONFIRMED',
      date: '2026-08-04T00:00:00.000Z',
    });
    await createTx({
      accountId,
      description: 'Sem envelope',
      amount: 20,
      type: 'EXPENSE',
      status: 'CONFIRMED',
      date: '2026-08-05T00:00:00.000Z',
    });

    const byEnvelope = await request(app.getHttpServer())
      .get('/api/v1/reports/expenses-by-envelope')
      .query({ from: '2026-08-01T00:00:00.000Z', to: '2026-08-31T23:59:59.000Z' })
      .set('Authorization', `Bearer ${tokens.accessToken}`);
    expect(byEnvelope.status).toBe(200);
    const envRows = byEnvelope.body as {
      envelopeId: string | null;
      envelopeName: string;
      total: string;
    }[];
    expect(envRows).toHaveLength(2);
    expect(envRows[0]!.envelopeName).toBe('Sem envelope');
    expect(envRows[0]!.total).toBe('495');
    expect(envRows[1]!.envelopeName).toBe('Envelope Rep');
    expect(envRows[1]!.total).toBe('80');
  });

  it('relatórios: extrato por conta e isolamento', async () => {
    const emailA = emailFor('rst-a');
    const regA = await register('Rst A', emailA, `Família Rst A ${suffix}`);
    const tokensA = regA.body as TokensResponse;
    const meA = await me(tokensA.accessToken);
    createdFamilies.push((meA.body as MeResponse).familyId);

    const acc = await request(app.getHttpServer())
      .post('/api/v1/accounts')
      .set('Authorization', `Bearer ${tokensA.accessToken}`)
      .send({ name: 'Conta Rst' });
    const accountId = (acc.body as { id: string }).id;

    const createTx = (body: object) =>
      request(app.getHttpServer())
        .post('/api/v1/transactions')
        .set('Authorization', `Bearer ${tokensA.accessToken}`)
        .send(body);

    await createTx({
      accountId,
      description: 'Entrada anterior',
      amount: 400,
      type: 'INCOME',
      status: 'CONFIRMED',
      date: '2026-07-15T00:00:00.000Z',
    });
    await createTx({
      accountId,
      description: 'Salário',
      amount: 300,
      type: 'INCOME',
      status: 'CONFIRMED',
      date: '2026-08-10T00:00:00.000Z',
    });
    await createTx({
      accountId,
      description: 'Mercado',
      amount: 100,
      type: 'EXPENSE',
      status: 'CONFIRMED',
      date: '2026-08-15T00:00:00.000Z',
    });

    const stmt = await request(app.getHttpServer())
      .get(`/api/v1/reports/account-statement/${accountId}`)
      .query({ from: '2026-08-01T00:00:00.000Z', to: '2026-08-31T23:59:59.000Z' })
      .set('Authorization', `Bearer ${tokensA.accessToken}`);
    expect(stmt.status).toBe(200);
    const stmtBody = stmt.body as {
      openingBalance: string;
      closingBalance: string;
      income: string;
      expense: string;
      transactions: { id: string }[];
    };
    expect(stmtBody.openingBalance).toBe('400');
    expect(stmtBody.income).toBe('300');
    expect(stmtBody.expense).toBe('100');
    expect(stmtBody.closingBalance).toBe('600');
    expect(stmtBody.transactions).toHaveLength(2);

    const stmtAll = await request(app.getHttpServer())
      .get(`/api/v1/reports/account-statement/${accountId}`)
      .set('Authorization', `Bearer ${tokensA.accessToken}`);
    expect(stmtAll.status).toBe(200);
    const stmtAllBody = stmtAll.body as {
      openingBalance: string;
      closingBalance: string;
      transactions: { id: string }[];
    };
    expect(stmtAllBody.openingBalance).toBe('0');
    expect(stmtAllBody.closingBalance).toBe('600');
    expect(stmtAllBody.transactions).toHaveLength(3);

    const emailB = emailFor('rst-b');
    const regB = await register('Rst B', emailB, `Família Rst B ${suffix}`);
    const tokensB = regB.body as TokensResponse;
    const meB = await me(tokensB.accessToken);
    createdFamilies.push((meB.body as MeResponse).familyId);

    const foreignStmt = await request(app.getHttpServer())
      .get(`/api/v1/reports/account-statement/${accountId}`)
      .set('Authorization', `Bearer ${tokensB.accessToken}`);
    expect(foreignStmt.status).toBe(404);

    const cashflowB = await request(app.getHttpServer())
      .get('/api/v1/reports/cashflow')
      .set('Authorization', `Bearer ${tokensB.accessToken}`);
    expect(cashflowB.status).toBe(200);
    expect((cashflowB.body as { income: string }).income).toBe('0');

    const memberInvite = await request(app.getHttpServer())
      .post('/api/v1/family/invitations')
      .set('Authorization', `Bearer ${tokensA.accessToken}`)
      .send({ email: emailFor('rst-member') });
    const memberAccept = await request(app.getHttpServer())
      .post('/api/v1/auth/accept-invitation')
      .send({
        token: (memberInvite.body as { inviteToken: string }).inviteToken,
        name: 'Rst Member',
        password: 'senha-segura-123',
      });
    const tokensMember = memberAccept.body as TokensResponse;

    const memberCashflow = await request(app.getHttpServer())
      .get('/api/v1/reports/cashflow')
      .set('Authorization', `Bearer ${tokensMember.accessToken}`);
    expect(memberCashflow.status).toBe(200);
  });

  it('relatórios: gastos por forma de pagamento', async () => {
    const email = emailFor('pay-a');
    const reg = await register('Pay A', email, `Família Pay A ${suffix}`);
    const tokens = reg.body as TokensResponse;
    const meRes = await me(tokens.accessToken);
    createdFamilies.push((meRes.body as MeResponse).familyId);

    const acc = await request(app.getHttpServer())
      .post('/api/v1/accounts')
      .set('Authorization', `Bearer ${tokens.accessToken}`)
      .send({ name: 'Conta Pay' });
    const accountId = (acc.body as { id: string }).id;

    const createTx = (body: object) =>
      request(app.getHttpServer())
        .post('/api/v1/transactions')
        .set('Authorization', `Bearer ${tokens.accessToken}`)
        .send(body);

    await createTx({
      accountId,
      description: 'Salário via Pix',
      amount: 1000,
      type: 'INCOME',
      status: 'CONFIRMED',
      paymentMethod: 'PIX',
      date: '2026-08-05T00:00:00.000Z',
    });
    await createTx({
      accountId,
      description: 'Mercado Pix',
      amount: 150,
      type: 'EXPENSE',
      status: 'CONFIRMED',
      paymentMethod: 'PIX',
      date: '2026-08-06T00:00:00.000Z',
    });
    await createTx({
      accountId,
      description: 'Conta de luz',
      amount: 120,
      type: 'EXPENSE',
      status: 'CONFIRMED',
      paymentMethod: 'BOLETO',
      date: '2026-08-07T00:00:00.000Z',
    });
    await createTx({
      accountId,
      description: 'Aluguel',
      amount: 800,
      type: 'EXPENSE',
      status: 'CONFIRMED',
      paymentMethod: 'CREDIT_CARD',
      date: '2026-08-08T00:00:00.000Z',
    });
    await createTx({
      accountId,
      description: 'Sem método',
      amount: 50,
      type: 'EXPENSE',
      status: 'CONFIRMED',
      date: '2026-08-09T00:00:00.000Z',
    });
    await createTx({
      accountId,
      description: 'Pendente Pix',
      amount: 999,
      type: 'EXPENSE',
      status: 'PENDING',
      paymentMethod: 'PIX',
      date: '2026-08-10T00:00:00.000Z',
    });
    await createTx({
      accountId,
      description: 'Boleto julho',
      amount: 70,
      type: 'EXPENSE',
      status: 'CONFIRMED',
      paymentMethod: 'BOLETO',
      date: '2026-07-20T00:00:00.000Z',
    });

    const invalid = await createTx({
      accountId,
      description: 'Método inválido',
      amount: 10,
      type: 'EXPENSE',
      paymentMethod: 'CREDITO',
    });
    expect(invalid.status).toBe(400);

    const rows = await request(app.getHttpServer())
      .get('/api/v1/reports/payment-methods')
      .query({ from: '2026-08-01T00:00:00.000Z', to: '2026-08-31T23:59:59.000Z' })
      .set('Authorization', `Bearer ${tokens.accessToken}`);
    expect(rows.status).toBe(200);
    const body = rows.body as {
      method: string | null;
      label: string;
      income: string;
      expense: string;
      count: number;
    }[];
    expect(body).toHaveLength(4);

    const byLabel = new Map(body.map((row) => [row.label, row]));

    const creditCard = byLabel.get('Cartão de crédito')!;
    expect(creditCard.income).toBe('0');
    expect(creditCard.expense).toBe('800');
    expect(creditCard.count).toBe(1);

    const pix = byLabel.get('Pix')!;
    expect(pix.income).toBe('1000');
    expect(pix.expense).toBe('150');
    expect(pix.count).toBe(2);

    const boleto = byLabel.get('Boleto')!;
    expect(boleto.expense).toBe('120');
    expect(boleto.count).toBe(1);

    const semMetodo = byLabel.get('Sem método')!;
    expect(semMetodo.method).toBeNull();
    expect(semMetodo.expense).toBe('50');
    expect(semMetodo.count).toBe(1);

    const emailB = emailFor('pay-b');
    const regB = await register('Pay B', emailB, `Família Pay B ${suffix}`);
    const tokensB = regB.body as TokensResponse;
    const meB = await me(tokensB.accessToken);
    createdFamilies.push((meB.body as MeResponse).familyId);

    const foreign = await request(app.getHttpServer())
      .get('/api/v1/reports/payment-methods')
      .set('Authorization', `Bearer ${tokensB.accessToken}`);
    expect(foreign.status).toBe(200);
    expect(foreign.body).toHaveLength(0);
  });
});
