import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseItauPdf } from './pdf-itau';

const FIXTURE = readFileSync(join(__dirname, '__fixtures__', 'itau-sample.pdf'));

describe('parseItauPdf', () => {
  it('descarta as linhas "SALDO DO DIA" e normaliza valores/tipos', async () => {
    const transactions = await parseItauPdf(FIXTURE);

    // 4 "SALDO DO DIA" na fixture não são transações — descartadas (9 linhas
    // de dados - 4 saldos = 5 transações reais).
    expect(transactions).toHaveLength(5);
    const byDescription = new Map(transactions.map((tx) => [tx.description, tx]));

    const fatura = byDescription.get('fatura paga cartao');
    expect(fatura?.amount).toBe('500.00');
    expect(fatura?.type).toBe('EXPENSE');
    expect(fatura?.paymentMethod).toBe('CREDIT_CARD');

    const boleto = byDescription.get('pag boleto energia eletrica');
    expect(boleto?.amount).toBe('80.00');
    expect(boleto?.type).toBe('EXPENSE');
    expect(boleto?.paymentMethod).toBe('BOLETO');

    const rendimento = byDescription.get('rend pago aplic aut mais');
    expect(rendimento?.amount).toBe('0.05');
    expect(rendimento?.type).toBe('INCOME');
    expect(rendimento?.paymentMethod).toBeNull();

    const salario = byDescription.get('remuneracao/salario');
    expect(salario?.amount).toBe('2679.95');
    expect(salario?.type).toBe('INCOME');
    expect(salario?.date).toBe('2026-09-01');

    // "JoaoDaSilva08/09" — a data colada sem espaço sai, o nome fica.
    const pix = byDescription.get('pix transf joaodasilva');
    expect(pix?.amount).toBe('100.00');
    expect(pix?.type).toBe('EXPENSE');
    expect(pix?.paymentMethod).toBe('PIX');
  });

  it('rejeita um PDF sem transações reconhecíveis', async () => {
    await expect(parseItauPdf(Buffer.from('não é um pdf'))).rejects.toThrow();
  });
});
