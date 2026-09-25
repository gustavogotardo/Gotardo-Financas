import { BadRequestException } from '@nestjs/common';
import { PaymentMethod } from '@gotardo/db';
// pdf2json é CommonJS de verdade (main: dist/pdfparser.cjs) — ao contrário de
// libs como pdfjs-dist (ESM-only), que não dá pra `require()`/`import()`
// dinâmico num projeto compilado para CommonJS (o import dinâmico vira
// `require()` no JS gerado, e `require()` não carrega `.mjs`).
import PDFParser from 'pdf2json';
import { parseAmount, parseBrDate } from './csv';
import { normalizeDescription, typeFromAmount, unsignedAmount, type ParsedTransaction } from './types';

// Extrai transações do extrato em PDF do Itaú (conta corrente/universitária).
// Só esse banco por enquanto — cada banco tem seu próprio layout de PDF (sem
// padrão comum entre eles, ao contrário do OFX), então suportar outro exige
// um parser dedicado, não uma extensão deste.
//
// pdf2json já devolve o texto agrupado por célula da tabela (uma célula =
// um "run"), com posição x/y — não é preciso reconstruir palavras soltas.
// Cada linha de transação tem exatamente 3 células: data, lançamento, valor
// (nunca duas células de valor na mesma linha, nem no arquivo real usado
// para validar isto). Linhas "SALDO DO DIA" são marcadores de saldo do
// banco, não transações — descartadas pelo texto do lançamento, mesmo
// critério do "SALDO ANTERIOR" no parser de CSV do Bradesco (`./csv.ts`).
//
// A descrição às vezes cola a contraparte direto na data, sem separador
// (ex.: "Adriano06/09"), diferente do "Des:"/"Rem:" de outros bancos — a
// única limpeza aplicada é remover essa data colada no fim; o resto do
// texto é mantido como veio do banco.

type Pdf2JsonTextRun = { x: number; y: number; R: Array<{ T: string }> };
type Pdf2JsonPage = { Texts: Pdf2JsonTextRun[] };
type Pdf2JsonData = { Pages: Pdf2JsonPage[] };

const _DATE = /^\d{2}\/\d{2}\/\d{4}$/;
const _AMOUNT = /^-?[\d.]+,\d{2}$/;
const _TRAILING_GLUED_DATE = /(\d{2}\/\d{2})$/;
const _SALDO_DO_DIA = /^saldo\s+do\s+dia$/i;

function paymentMethodFromDescription(description: string): PaymentMethod | null {
  const text = description.trim().toUpperCase();
  if (text.startsWith('PIX')) return PaymentMethod.PIX;
  if (text.startsWith('PAG BOLETO')) return PaymentMethod.BOLETO;
  if (text.startsWith('FATURA PAGA')) return PaymentMethod.CREDIT_CARD;
  return null;
}

function cleanDescription(description: string): string {
  // remove só uma data grudada sem espaço no fim (ex.: "...Silva08/09"); se
  // houver espaço antes da data, não é "colada" e não mexemos (evita cortar
  // datas que já fazem parte de um texto legível).
  const match = description.match(_TRAILING_GLUED_DATE);
  if (match && match.index !== undefined) {
    const before = description[match.index - 1];
    if (before !== ' ' && before !== undefined) {
      return description.slice(0, match.index).trim();
    }
  }
  return description.trim();
}

function extractPdfText(buffer: Buffer): Promise<Pdf2JsonData> {
  return new Promise((resolve, reject) => {
    const parser = new PDFParser();
    parser.on('pdfParser_dataError', (err: Error | { parserError: Error }) => {
      reject(err instanceof Error ? err : err.parserError);
    });
    parser.on('pdfParser_dataReady', (data: Pdf2JsonData) => resolve(data));
    // pdf2json@4.1.0's parseBuffer() has a bug: it compares
    // `buffer.buffer.byteLength !== buffer.length` to detect a buffer that
    // needs re-slicing, but then re-slices from byte 0 of the underlying
    // ArrayBuffer instead of `buffer.byteOffset` — corrupting the data
    // whenever the Buffer is a view into a larger, pooled ArrayBuffer. Node
    // pools allocations below ~4KB (e.g. small files from `multer`'s
    // memoryStorage or `fs.readFileSync`), so this silently breaks parsing
    // of small PDFs specifically. Copying into a freshly, exactly-sized
    // ArrayBuffer sidesteps the buggy branch entirely.
    const exact = new ArrayBuffer(buffer.length);
    new Uint8Array(exact).set(buffer);
    parser.parseBuffer(Buffer.from(exact));
  });
}

export async function parseItauPdf(buffer: Buffer): Promise<ParsedTransaction[]> {
  let data: Pdf2JsonData;
  try {
    data = await extractPdfText(buffer);
  } catch (error) {
    throw new BadRequestException(
      error instanceof Error ? `Não foi possível ler o PDF: ${error.message}` : 'Não foi possível ler o PDF',
    );
  }

  const transactions: ParsedTransaction[] = [];
  for (const page of data.Pages) {
    const rows = new Map<number, { x: number; text: string }[]>();
    for (const run of page.Texts) {
      const y = Math.round(run.y * 100) / 100;
      const text = decodeURIComponent(run.R.map((r) => r.T).join(''));
      const row = rows.get(y);
      if (row) row.push({ x: run.x, text });
      else rows.set(y, [{ x: run.x, text }]);
    }

    for (const y of [...rows.keys()].sort((a, b) => a - b)) {
      const cells = rows.get(y)!.sort((a, b) => a.x - b.x);
      if (!cells[0] || !_DATE.test(cells[0].text)) {
        continue; // cabeçalho, rodapé/avisos, ou linha sem data
      }
      const rest = cells.slice(1);
      const amountCell = rest.find((c) => _AMOUNT.test(c.text));
      if (!amountCell) {
        continue;
      }
      const descriptionRaw = rest
        .filter((c) => c !== amountCell)
        .map((c) => c.text)
        .join(' ')
        .trim();
      if (_SALDO_DO_DIA.test(descriptionRaw)) {
        continue;
      }
      const amount = parseAmount(amountCell.text);
      if (!amount || Number(amount) === 0) {
        continue;
      }
      const date = parseBrDate(cells[0].text);
      if (!date) {
        continue;
      }
      transactions.push({
        date,
        description: normalizeDescription(cleanDescription(descriptionRaw)) || 'Importação',
        amount: unsignedAmount(amount),
        type: typeFromAmount(amount),
        paymentMethod: paymentMethodFromDescription(descriptionRaw),
      });
    }
  }

  if (transactions.length === 0) {
    throw new BadRequestException('Nenhuma transação reconhecida no PDF (Itaú)');
  }
  return transactions;
}
