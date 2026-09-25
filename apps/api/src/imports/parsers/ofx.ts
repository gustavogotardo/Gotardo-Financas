import { PaymentMethod, TransactionType } from '@gotardo/db';
import { normalizeDescription, typeFromAmount, unsignedAmount, type ParsedTransaction } from './types';

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

// Bancos brasileiros (Bradesco, no arquivo de referência) gravam em NAME/MEMO
// um texto composto: um prefixo que identifica a forma de pagamento, às
// vezes seguido de "Des:"/"Rem:" (destinatário de um Pix enviado/QR code, ou
// remetente de um Pix recebido) e, com frequência, a data do lançamento
// duplicada no fim — que já temos em tx.date. Sem isso, a Descrição vira o
// prefixo inteiro (ex.: "pix qrcode est des: alex bello quintella 04/09") em
// vez do nome de quem recebeu/enviou, e a forma de pagamento nunca é
// separada em PaymentMethod. Ambas as extrações abaixo são best-effort sobre
// texto livre do banco — quando nada reconhecido é encontrado, o texto
// original é preservado (nunca perdemos informação).
const DEBIT_CARD_PREFIX = /^compra\s+cart\.?\s*(elo|visa|master\s*card)?\s*/i;
const BOLETO_PREFIX = /^pagto\s+cobran(?:c|ç)a\s*/i;
const CREDIT_CARD_PREFIX = /^gasto\s+c\s+cr(?:e|é)dito\s*/i;
const STRIPPABLE_PREFIXES = [DEBIT_CARD_PREFIX, BOLETO_PREFIX, CREDIT_CARD_PREFIX];

function paymentMethodFromMemo(text: string): PaymentMethod | null {
  const trimmed = text.trim();
  if (/^pix\b/i.test(trimmed)) return PaymentMethod.PIX;
  if (DEBIT_CARD_PREFIX.test(trimmed)) return PaymentMethod.DEBIT_CARD;
  if (BOLETO_PREFIX.test(trimmed)) return PaymentMethod.BOLETO;
  if (CREDIT_CARD_PREFIX.test(trimmed)) return PaymentMethod.CREDIT_CARD;
  return null;
}

function descriptionFromMemo(text: string): string {
  const trimmed = text.trim();
  // Pix: "<forma de pagamento> Des: <destinatário> [dd/mm]" (enviado/QR code)
  // ou "... Rem: <remetente> [dd/mm]" (recebido) — extrai só a contraparte.
  const counterparty = trimmed.match(/\b(?:des|rem)\s*:\s*(.+)$/i);
  if (counterparty) {
    const after = counterparty[1]!.replace(/\s+\d{1,2}\/\d{1,2}\s*$/, '').trim();
    if (after) return after;
  }
  for (const prefix of STRIPPABLE_PREFIXES) {
    if (prefix.test(trimmed)) {
      const after = trimmed.replace(prefix, '').trim();
      if (after) return after;
    }
  }
  return trimmed;
}

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
    const rawText = [name, memo].filter((item): item is string => Boolean(item)).join(' - ');
    const description = normalizeDescription(descriptionFromMemo(rawText)) || 'Importação';
    const type = (trntype && TRNTYPE_TO_TYPE[trntype]) || typeFromAmount(amount);
    transactions.push({
      date: rawDate ? parseOfxDate(rawDate) : new Date().toISOString().slice(0, 10),
      description,
      amount: unsignedAmount(amount),
      type,
      externalId: fitid,
      paymentMethod: paymentMethodFromMemo(rawText),
    });
  }
  return transactions;
}
