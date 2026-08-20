import { TransactionType } from '@gotardo/db';
import { normalizeDescription, typeFromAmount, type ParsedTransaction } from './types';

const TRNTYPE_TO_TYPE: Record<string, TransactionType> = {
  CREDIT: TransactionType.INCOME,
  DEBIT: TransactionType.EXPENSE,
  CHECK: TransactionType.EXPENSE,
  PAYMENT: TransactionType.EXPENSE,
  POS: TransactionType.EXPENSE,
  ATM: TransactionType.EXPENSE,
  DEP: TransactionType.INCOME,
  DIRECTDEP: TransactionType.INCOME,
  XFER: TransactionType.TRANSFER,
  CASH: TransactionType.EXPENSE,
};

const STMTTRN_BLOCK = /<STMTTRN[^>]*>([\s\S]*?)(?=<\/STMTTRN\s*>|<STMTTRN|<\/BANKTRANLIST>|$)/gi;

function extract(block: string, tag: string): string | undefined {
  const closed = new RegExp(`<${tag}[^>]*>\\s*([^<]*?)\\s*</${tag}\\s*>`, 'i');
  const closedMatch = block.match(closed);
  if (closedMatch) {
    return closedMatch[1]!.trim();
  }
  const open = new RegExp(`<${tag}[^>]*>\\s*([^<]*?)\\s*(?=<|$)`, 'i');
  const openMatch = block.match(open);
  if (openMatch) {
    return openMatch[1]!.trim();
  }
  const sgml = new RegExp(`<${tag}:([^>]*)>`, 'i');
  const sgmlMatch = block.match(sgml);
  return sgmlMatch ? sgmlMatch[1]!.trim() : undefined;
}

function parseOfxDate(raw: string): string {
  const match = raw.match(/^(\d{4})(\d{2})(\d{2})/);
  if (!match) {
    return new Date().toISOString().slice(0, 10);
  }
  return `${match[1]}-${match[2]}-${match[3]}`;
}

export function parseOfx(content: string): ParsedTransaction[] {
  const transactions: ParsedTransaction[] = [];
  const blocks = [...content.matchAll(STMTTRN_BLOCK)];
  for (const match of blocks) {
    const block = match[1] ?? '';
    const rawAmount = extract(block, 'TRNAMT');
    if (!rawAmount) {
      continue;
    }
    const amount = rawAmount.replace(/[\sR$]/g, '').replace(',', '.');
    const trntype = extract(block, 'TRNTYPE')?.toUpperCase();
    const rawDate = extract(block, 'DTPOSTED');
    const fitid = extract(block, 'FITID');
    const name = extract(block, 'NAME');
    const memo = extract(block, 'MEMO');
    const description =
      normalizeDescription(
        [name, memo].filter((item): item is string => Boolean(item)).join(' - '),
      ) || 'Importação';
    const type = (trntype && TRNTYPE_TO_TYPE[trntype]) || typeFromAmount(amount);
    transactions.push({
      date: rawDate ? parseOfxDate(rawDate) : new Date().toISOString().slice(0, 10),
      description,
      amount,
      type,
      externalId: fitid,
      paymentMethod: null,
    });
  }
  return transactions;
}
