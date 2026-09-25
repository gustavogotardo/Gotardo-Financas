import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import ExcelJS from 'exceljs';
import { PrismaModule, PrismaService } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { AccountsModule } from '../accounts/accounts.module';
import { StorageModule } from '../storage/storage.module';
import { ImportsModule } from '../imports/imports.module';
import { TransactionsModule } from '../transactions/transactions.module';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';

process.env.DATABASE_URL = 'postgresql://gotardo_test:gotardo_test@localhost:5433/gotardo_test?schema=public';
process.env.JWT_ACCESS_SECRET = 'e2e-jwt-secret';
process.env.JWT_ACCESS_TTL = '15m';
process.env.JWT_REFRESH_TTL = '30d';

const CSV_SAMPLE = [
  'data;descricao;valor',
  '01/08/2026;PADARIA CENTRAL;-18,50',
  '05/08/2026;SALARIO;+3250,00',
  '10/08/2026;MERCADO;-120,30',
].join('\n');

const BRADESCO_CSV_SAMPLE = [
  'Extrato de: Ag: 1234 | Conta: 123456-7 | Entre 01/01/2026 e 31/01/2026',
  'Data;Histórico;Docto.;Crédito (R$);Débito (R$);Saldo (R$);',
  '30/12/25;SALDO ANTERIOR;;;;"1,00";',
  '05/01/26; Resgate Inv Fac;5050404;"329,63";;"330,63";',
  '05/01/26; Rent.inv.facil;5050404;"0,04";;"330,67";',
  '06/01/26; Pagamento boleto;5050404;;"25,00";"305,67";',
  ';Total;;"12.746,08";"-12.746,08";"1,00";',
].join('\r');

const OFX_SAMPLE = `OFXHEADER:100
DATA:OFXSGML
VERSION:102
<OFX>
<BANKMSGSRSV1>
<STMTTRNRS>
<STMTRS>
<BANKTRANLIST>
<STMTTRN><TRNTYPE>DEBIT</TRNTYPE><DTPOSTED>20260812</DTPOSTED><TRNAMT>-45,90</TRNAMT><FITID>OFX001</FITID><NAME>FARMACIA</NAME></STMTTRN>
<STMTTRN><TRNTYPE>CREDIT</TRNTYPE><DTPOSTED>20260814</DTPOSTED><TRNAMT>150,00</TRNAMT><FITID>OFX002</FITID><NAME>REEMBOLSO</NAME></STMTTRN>
</BANKTRANLIST>
</STMTRS>
</STMTTRNRS>
</BANKMSGSRSV1>
</OFX>`;

// Amostra reduzida, baseada num extrato real do Bradesco: tags SGML antigas,
// sem fechamento (</STMTTRN> em vez de valor fechado), e o MEMO carregando a
// forma de pagamento + "Des:"/"Rem:" + data duplicada, exatamente como o
// banco exporta. Cobre os prefixos reconhecidos (Pix Des:/Rem:, Compra Cart
// Elo, Pagto Cobranca, Gasto c Credito) e um caso não reconhecido (Trans Sal)
// para garantir que o fallback preserva o texto original.
const OFX_BRADESCO_SAMPLE = `OFXHEADER:100
DATA:OFXSGML
VERSION:102
<OFX>
	<BANKMSGSRSV1>
		<STMTTRNRS>
			<STMTRS>
				<BANKTRANLIST>
					<STMTTRN>
						<TRNTYPE>CREDIT
						<DTPOSTED>20260901000000[-03:EST]
						<TRNAMT>8551.93
						<FITID>N20063
						<MEMO>Trans Sal p/c/c Dep.transit.floating Berj
					</STMTTRN>
					<STMTTRN>
						<TRNTYPE>DEBIT
						<DTPOSTED>20260904000000[-03:EST]
						<TRNAMT>-19.67
						<FITID>N20080
						<MEMO>Compra Cart Elo Supermercado Supremo
					</STMTTRN>
					<STMTTRN>
						<TRNTYPE>DEBIT
						<DTPOSTED>20260904000000[-03:EST]
						<TRNAMT>-9.50
						<FITID>N2009E
						<MEMO>Pix Qrcode Est Des: Alex Bello Quintella 04/09
					</STMTTRN>
					<STMTTRN>
						<TRNTYPE>CREDIT
						<DTPOSTED>20260909000000[-03:EST]
						<TRNAMT>270.53
						<FITID>N20152
						<MEMO>Pix Recebido Rem: Joao Gabriel Moncao 09/09
					</STMTTRN>
					<STMTTRN>
						<TRNTYPE>DEBIT
						<DTPOSTED>20260910000000[-03:EST]
						<TRNAMT>-395.00
						<FITID>N201AA
						<MEMO>Pagto Cobranca Escola Integral Felipe 09/2026
					</STMTTRN>
					<STMTTRN>
						<TRNTYPE>DEBIT
						<DTPOSTED>20260910000000[-03:EST]
						<TRNAMT>-665.20
						<FITID>N201E6
						<MEMO>Gasto c Credito
					</STMTTRN>
				</BANKTRANLIST>
			</STMTRS>
		</STMTTRNRS>
	</BANKMSGSRSV1>
</OFX>`;

// Builds a real .xlsx workbook (via exceljs) with typed cells, mirroring what
// a user exporting from Excel/Google Sheets actually produces: the date and
// valor columns are native `Date`/`number` cells, not string literals. This
// specifically regression-tests two bugs found in code review:
//  - a native Date cell with day-of-month > 12 (24) used to corrupt/crash on
//    the old string/CSV round-trip parser (ambiguous m/d/yy vs dd/mm/yy).
//  - a native numeric cell >= 1000 (3250.50) used to get mangled 1000x by the
//    comma/dot swapping logic meant for string amounts (e.g. "3,250.50").
async function buildXlsxSample(): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Extrato');
  sheet.addRow(['data', 'descricao', 'valor']);
  sheet.addRow([new Date(Date.UTC(2026, 7, 1)), 'PADARIA CENTRAL', -18.5]);
  sheet.addRow([new Date(Date.UTC(2026, 7, 24)), 'SALARIO', 3250.5]);
  sheet.addRow(['10/08/2026', 'MERCADO', -120.3]);
  return (await workbook.xlsx.writeBuffer()) as unknown as Buffer;
}

type TokensResponse = { accessToken: string; refreshToken: string };
type MeResponse = { id: string; email: string; role: string; familyId: string };

describe('Importação de extratos (e2e)', () => {
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

  const createAccount = (token: string, name: string) =>
    request(app.getHttpServer())
      .post('/api/v1/accounts')
      .set('Authorization', `Bearer ${token}`)
      .send({ name, type: 'CHECKING' });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        PrismaModule,
        StorageModule,
        AuthModule,
        AccountsModule,
        ImportsModule,
        TransactionsModule,
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
    await prisma.$transaction([
      prisma.transaction.deleteMany({ where: { familyId: { in: createdFamilies } } }),
      prisma.document.deleteMany({ where: { familyId: { in: createdFamilies } } }),
      prisma.account.deleteMany({ where: { familyId: { in: createdFamilies } } }),
      // Ver comentário equivalente em goals.e2e.spec.ts: o checker global de
      // notificações (E3.2) pode ter criado notificações para estes usuários.
      prisma.notification.deleteMany({ where: { familyId: { in: createdFamilies } } }),
      prisma.refreshToken.deleteMany({
        where: { user: { familyId: { in: createdFamilies } } },
      }),
      prisma.user.deleteMany({ where: { familyId: { in: createdFamilies } } }),
      prisma.family.deleteMany({ where: { id: { in: createdFamilies } } }),
    ]);
    await app.close();
  });

  it('importa um CSV e cria transações PENDING com source IMPORT', async () => {
    const email = emailFor('imp-csv');
    const reg = await register('Imp CSV', email, `Família Imp CSV ${suffix}`);
    const tokens = reg.body as TokensResponse;
    const meRes = await me(tokens.accessToken);
    const family = (meRes.body as MeResponse).familyId;
    createdFamilies.push(family);

    const account = await createAccount(tokens.accessToken, 'Conta Imp CSV');
    const accountId = (account.body as { id: string }).id;

    const upload = await request(app.getHttpServer())
      .post('/api/v1/imports')
      .set('Authorization', `Bearer ${tokens.accessToken}`)
      .field('accountId', accountId)
      .attach('file', Buffer.from(CSV_SAMPLE, 'utf8'), 'extrato.csv');

    expect(upload.status).toBe(201);
    const imported = upload.body as { id: string; status: string; transactionCount: number };
    expect(imported.status).toBe('PROCESSED');
    expect(imported.transactionCount).toBe(3);

    const transactions = await prisma.transaction.findMany({
      where: { documentId: imported.id },
    });
    expect(transactions).toHaveLength(3);
    expect(transactions.every((tx) => tx.status === 'PENDING')).toBe(true);
    expect(transactions.every((tx) => tx.source === 'IMPORT')).toBe(true);
    const salario = transactions.find((tx) => tx.description === 'salario');
    expect(salario?.amount.toString()).toBe('3250');
  });

  it('importa CSV do Bradesco (colunas crédito/débito, ano 2 dígitos)', async () => {
    const email = emailFor('imp-bradesco');
    const reg = await register('Imp Bradesco', email, `Família Imp Bradesco ${suffix}`);
    const tokens = reg.body as TokensResponse;
    const meRes = await me(tokens.accessToken);
    const family = (meRes.body as MeResponse).familyId;
    createdFamilies.push(family);

    const account = await createAccount(tokens.accessToken, 'Conta Bradesco');
    const accountId = (account.body as { id: string }).id;

    const upload = await request(app.getHttpServer())
      .post('/api/v1/imports')
      .set('Authorization', `Bearer ${tokens.accessToken}`)
      .field('accountId', accountId)
      .attach('file', Buffer.from(BRADESCO_CSV_SAMPLE, 'latin1'), 'bradesco.csv');

    expect(upload.status).toBe(201);
    const imported = upload.body as { id: string; status: string; transactionCount: number };
    expect(imported.status).toBe('PROCESSED');
    expect(imported.transactionCount).toBe(3);

    const transactions = await prisma.transaction.findMany({ where: { documentId: imported.id } });
    const resgate = transactions.find((tx) => tx.description === 'resgate inv fac');
    const boleto = transactions.find((tx) => tx.description === 'pagamento boleto');
    expect(resgate?.amount.toString()).toBe('329.63');
    expect(resgate?.type).toBe('INCOME');
    expect(resgate?.date.toISOString().slice(0, 10)).toBe('2026-01-05');
    // amount é sempre a magnitude positiva da transação — o sinal vem do
    // `type`, nunca do valor em si (mesma convenção do CreateTransactionDto,
    // que rejeita amount negativo). Uma despesa importada com amount negativo
    // faz confirmTransaction() somar ao saldo da conta em vez de subtrair.
    expect(boleto?.amount.toString()).toBe('25');
    expect(boleto?.type).toBe('EXPENSE');
  });

  it('confirmar despesas e receitas importadas atualiza o saldo da conta corretamente', async () => {
    // Regressão: os parsers guardavam o amount de despesas já negativo (vindo
    // do sinal do banco), e balanceDelta() negava de novo — confirmar uma
    // despesa importada SOMAVA ao saldo em vez de subtrair.
    const email = emailFor('imp-saldo');
    const reg = await register('Imp Saldo', email, `Família Imp Saldo ${suffix}`);
    const tokens = reg.body as TokensResponse;
    const meRes = await me(tokens.accessToken);
    const family = (meRes.body as MeResponse).familyId;
    createdFamilies.push(family);

    const account = await createAccount(tokens.accessToken, 'Conta Saldo');
    const accountId = (account.body as { id: string }).id;

    const upload = await request(app.getHttpServer())
      .post('/api/v1/imports')
      .set('Authorization', `Bearer ${tokens.accessToken}`)
      .field('accountId', accountId)
      .attach('file', Buffer.from(CSV_SAMPLE, 'utf8'), 'extrato.csv');
    expect(upload.status).toBe(201);
    const imported = upload.body as { id: string };

    const transactions = await prisma.transaction.findMany({
      where: { documentId: imported.id },
    });
    for (const tx of transactions) {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/transactions/${tx.id}`)
        .set('Authorization', `Bearer ${tokens.accessToken}`)
        .send({ status: 'CONFIRMED' });
      expect(res.status).toBe(200);
    }

    // CSV_SAMPLE: -18,50 + 3250,00 - 120,30 = 3111,20
    const updatedAccount = await prisma.account.findFirstOrThrow({ where: { id: accountId } });
    expect(updatedAccount.balance.toString()).toBe('3111.2');
  });

  it('deduplica ao importar o mesmo CSV de novo', async () => {
    const email = emailFor('imp-dedup');
    const reg = await register('Imp Dedup', email, `Família Imp Dedup ${suffix}`);
    const tokens = reg.body as TokensResponse;
    const meRes = await me(tokens.accessToken);
    const family = (meRes.body as MeResponse).familyId;
    createdFamilies.push(family);

    const account = await createAccount(tokens.accessToken, 'Conta Dedup');
    const accountId = (account.body as { id: string }).id;

    const first = await request(app.getHttpServer())
      .post('/api/v1/imports')
      .set('Authorization', `Bearer ${tokens.accessToken}`)
      .field('accountId', accountId)
      .attach('file', Buffer.from(CSV_SAMPLE, 'utf8'), 'extrato.csv');
    expect(first.status).toBe(201);

    const second = await request(app.getHttpServer())
      .post('/api/v1/imports')
      .set('Authorization', `Bearer ${tokens.accessToken}`)
      .field('accountId', accountId)
      .attach('file', Buffer.from(CSV_SAMPLE, 'utf8'), 'extrato.csv');
    expect(second.status).toBe(201);
    const secondBody = second.body as { id: string; transactionCount: number };
    expect(secondBody.transactionCount).toBe(0);

    const all = await prisma.transaction.findMany({ where: { familyId: family } });
    expect(all).toHaveLength(3);
  });

  it('importa OFX e usa FITID como externalId', async () => {
    const email = emailFor('imp-ofx');
    const reg = await register('Imp OFX', email, `Família Imp OFX ${suffix}`);
    const tokens = reg.body as TokensResponse;
    const meRes = await me(tokens.accessToken);
    const family = (meRes.body as MeResponse).familyId;
    createdFamilies.push(family);

    const account = await createAccount(tokens.accessToken, 'Conta OFX');
    const accountId = (account.body as { id: string }).id;

    const upload = await request(app.getHttpServer())
      .post('/api/v1/imports')
      .set('Authorization', `Bearer ${tokens.accessToken}`)
      .field('accountId', accountId)
      .attach('file', Buffer.from(OFX_SAMPLE, 'utf8'), 'extrato.ofx');

    expect(upload.status).toBe(201);
    const imported = upload.body as { id: string; transactionCount: number };
    expect(imported.transactionCount).toBe(2);

    const transactions = await prisma.transaction.findMany({
      where: { documentId: imported.id },
      orderBy: { date: 'asc' },
    });
    expect(transactions).toHaveLength(2);
    expect(transactions[0]?.externalId).toBe('OFX001');
    expect(transactions[0]?.type).toBe('EXPENSE');
    // OFX manda TRNAMT já negativo para débitos ("-45,90") — mesma normalização
    // do CSV/XLSX: amount fica com a magnitude positiva, o sinal é só o type.
    expect(transactions[0]?.amount.toString()).toBe('45.9');
    expect(transactions[1]?.externalId).toBe('OFX002');
    expect(transactions[1]?.type).toBe('INCOME');
    expect(transactions[1]?.amount.toString()).toBe('150');
  });

  it('importa OFX do Bradesco e separa forma de pagamento/destinatário do MEMO', async () => {
    const email = emailFor('imp-ofx-bradesco');
    const reg = await register('Imp OFX Bradesco', email, `Família Imp OFX Bradesco ${suffix}`);
    const tokens = reg.body as TokensResponse;
    const meRes = await me(tokens.accessToken);
    const family = (meRes.body as MeResponse).familyId;
    createdFamilies.push(family);

    const account = await createAccount(tokens.accessToken, 'Conta Bradesco OFX');
    const accountId = (account.body as { id: string }).id;

    const upload = await request(app.getHttpServer())
      .post('/api/v1/imports')
      .set('Authorization', `Bearer ${tokens.accessToken}`)
      .field('accountId', accountId)
      .attach('file', Buffer.from(OFX_BRADESCO_SAMPLE, 'utf8'), 'bradesco.ofx');

    expect(upload.status).toBe(201);
    const imported = upload.body as { id: string; status: string; transactionCount: number };
    expect(imported.status).toBe('PROCESSED');
    expect(imported.transactionCount).toBe(6);

    const byFitid = new Map(
      (
        await prisma.transaction.findMany({ where: { documentId: imported.id } })
      ).map((tx) => [tx.externalId, tx]),
    );

    // Sem "Des:"/"Rem:" e sem prefixo reconhecido: mantém o MEMO inteiro e
    // não classifica forma de pagamento (nunca perde informação).
    const salario = byFitid.get('N20063');
    expect(salario?.description).toBe('trans sal p/c/c dep.transit.floating berj');
    expect(salario?.paymentMethod).toBeNull();

    // "Compra Cart Elo <estabelecimento>" — bandeira e "Compra Cart" saem da
    // descrição, viram DEBIT_CARD.
    const compra = byFitid.get('N20080');
    expect(compra?.description).toBe('supermercado supremo');
    expect(compra?.paymentMethod).toBe('DEBIT_CARD');

    // Pix enviado/QR code: "Des: <nome> <dd/mm>" — fica só o nome, sem a data
    // duplicada (já está em tx.date).
    const pixDes = byFitid.get('N2009E');
    expect(pixDes?.description).toBe('alex bello quintella');
    expect(pixDes?.paymentMethod).toBe('PIX');

    // Pix recebido: "Rem: <nome> <dd/mm>" (remetente, não destinatário).
    const pixRem = byFitid.get('N20152');
    expect(pixRem?.description).toBe('joao gabriel moncao');
    expect(pixRem?.paymentMethod).toBe('PIX');

    // Boleto: "Pagto Cobranca <descrição>" — o prefixo sai, mas o mm/aaaa de
    // referência no fim NÃO é removido (não é a data duplicada, é a
    // competência do boleto).
    const boleto = byFitid.get('N201AA');
    expect(boleto?.description).toBe('escola integral felipe 09/2026');
    expect(boleto?.paymentMethod).toBe('BOLETO');

    // "Gasto c Credito" sem nada depois: sem detalhe extra pra extrair, mas
    // ainda assim classificado como CREDIT_CARD.
    const credito = byFitid.get('N201E6');
    expect(credito?.description).toBe('gasto c credito');
    expect(credito?.paymentMethod).toBe('CREDIT_CARD');
  });

  it('importa um XLSX e cria transações PENDING com source IMPORT', async () => {
    const email = emailFor('imp-xlsx');
    const reg = await register('Imp XLSX', email, `Família Imp XLSX ${suffix}`);
    const tokens = reg.body as TokensResponse;
    const meRes = await me(tokens.accessToken);
    const family = (meRes.body as MeResponse).familyId;
    createdFamilies.push(family);

    const account = await createAccount(tokens.accessToken, 'Conta Imp XLSX');
    const accountId = (account.body as { id: string }).id;

    const upload = await request(app.getHttpServer())
      .post('/api/v1/imports')
      .set('Authorization', `Bearer ${tokens.accessToken}`)
      .field('accountId', accountId)
      .attach('file', await buildXlsxSample(), 'extrato.xlsx');

    expect(upload.status).toBe(201);
    const imported = upload.body as { id: string; status: string; transactionCount: number };
    expect(imported.status).toBe('PROCESSED');
    expect(imported.transactionCount).toBe(3);

    const transactions = await prisma.transaction.findMany({
      where: { documentId: imported.id },
    });
    expect(transactions).toHaveLength(3);
    expect(transactions.every((tx) => tx.status === 'PENDING')).toBe(true);
    expect(transactions.every((tx) => tx.source === 'IMPORT')).toBe(true);
    const padaria = transactions.find((tx) => tx.description === 'padaria central');
    expect(padaria?.amount.toString()).toBe('18.5');
    expect(padaria?.type).toBe('EXPENSE');
    expect(padaria?.date.toISOString().slice(0, 10)).toBe('2026-08-01');
    // Regression: native Date cell with day-of-month > 12 (24) must not be
    // misread as month 24 (invalid) nor swapped to the 12th.
    const salario = transactions.find((tx) => tx.description === 'salario');
    expect(salario?.type).toBe('INCOME');
    expect(salario?.date.toISOString().slice(0, 10)).toBe('2026-08-24');
    // Regression: native numeric cell >= 1000 must not be corrupted 1000x by
    // string-based comma/dot amount guessing (was producing 3.2505).
    expect(salario?.amount.toString()).toBe('3250.5');
  });

  it('importa um PDF (extrato Itaú) e cria transações PENDING com source IMPORT', async () => {
    const email = emailFor('imp-pdf');
    const reg = await register('Imp PDF', email, `Família Imp PDF ${suffix}`);
    const tokens = reg.body as TokensResponse;
    const meRes = await me(tokens.accessToken);
    const family = (meRes.body as MeResponse).familyId;
    createdFamilies.push(family);

    const account = await createAccount(tokens.accessToken, 'Conta Itaú');
    const accountId = (account.body as { id: string }).id;

    const fixture = readFileSync(
      join(__dirname, '..', 'imports', 'parsers', '__fixtures__', 'itau-sample.pdf'),
    );
    const upload = await request(app.getHttpServer())
      .post('/api/v1/imports')
      .set('Authorization', `Bearer ${tokens.accessToken}`)
      .field('accountId', accountId)
      .attach('file', fixture, 'extrato.pdf');

    expect(upload.status).toBe(201);
    const imported = upload.body as { id: string; status: string; transactionCount: number };
    expect(imported.status).toBe('PROCESSED');
    // 9 linhas de dados na fixture, 4 "SALDO DO DIA" descartadas = 5 transações.
    expect(imported.transactionCount).toBe(5);

    const transactions = await prisma.transaction.findMany({
      where: { documentId: imported.id },
    });
    expect(transactions.every((tx) => tx.status === 'PENDING')).toBe(true);
    expect(transactions.every((tx) => tx.source === 'IMPORT')).toBe(true);
    const boleto = transactions.find((tx) => tx.description === 'pag boleto energia eletrica');
    expect(boleto?.amount.toString()).toBe('80');
    expect(boleto?.type).toBe('EXPENSE');
    expect(boleto?.paymentMethod).toBe('BOLETO');
  });

  it('rejeita formato não suportado', async () => {
    const email = emailFor('imp-bad');
    const reg = await register('Imp Bad', email, `Família Imp Bad ${suffix}`);
    const tokens = reg.body as TokensResponse;
    const meRes = await me(tokens.accessToken);
    const family = (meRes.body as MeResponse).familyId;
    createdFamilies.push(family);

    const account = await createAccount(tokens.accessToken, 'Conta Bad');
    const accountId = (account.body as { id: string }).id;

    const upload = await request(app.getHttpServer())
      .post('/api/v1/imports')
      .set('Authorization', `Bearer ${tokens.accessToken}`)
      .field('accountId', accountId)
      .attach('file', Buffer.from('texto aleatório', 'utf8'), 'notas.txt');

    expect(upload.status).toBe(400);
  });
});