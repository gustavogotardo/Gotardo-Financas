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
import { HealthModule } from '../health/health.module';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';

process.env.DATABASE_URL = 'postgresql://gotardo:gotardo@localhost:5432/gotardo_test?schema=public';
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
    expect(rotatedReuse.status).toBe(401);
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
});
