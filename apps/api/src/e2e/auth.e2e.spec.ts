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
      await prisma.account.deleteMany({ where: { familyId: { in: createdFamilies } } });
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
});
