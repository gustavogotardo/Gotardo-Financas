import { BadRequestException } from '@nestjs/common';
import { normalizeDescription, typeFromAmount, type ParsedTransaction } from './types';

function detectDelimiter(lines: string[]): string {
  const sample = lines.slice(0, 20).join('\n');
  const semicolons = (sample.match(/;/g) ?? []).length;
  const commas = (sample.match(/,/g) ?? []).length;
  return semicolons > commas ? ';' : ',';
}

function splitLine(line: string, delim: string): string[] {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (char === delim && !inQuotes) {
      cells.push(current);
      current = '';
      continue;
    }
    current += char;
  }
  cells.push(current);
  return cells;
}

function parseBrDate(raw: string): string {
  const value = raw.trim();
  const ddmmyyyy = value.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (ddmmyyyy) {
    const [, day, month, year] = ddmmyyyy;
    return `${year}-${month!.padStart(2, '0')}-${day!.padStart(2, '0')}`;
  }
  const ddmmyy = value.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2})$/);
  if (ddmmyy) {
    const [, day, month, shortYear] = ddmmyy;
    const year = Number(shortYear) < 70 ? `20${shortYear}` : `19${shortYear}`;
    return `${year}-${month!.padStart(2, '0')}-${day!.padStart(2, '0')}`;
  }
  const yyyymmdd = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (yyyymmdd) {
    return value;
  }
  const ddmmyyyyLong = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4}) (\d{1,2}):(\d{2})/);
  if (ddmmyyyyLong) {
    const [, day, month, year] = ddmmyyyyLong;
    return `${year}-${month!.padStart(2, '0')}-${day!.padStart(2, '0')}`;
  }
  return new Date().toISOString().slice(0, 10);
}

function parseAmount(raw: string): string {
  let value = raw.replace(/[^\d.,-]/g, '');
  const negative = value.startsWith('-');
  value = value.replace(/-/g, '');
  const hasComma = value.includes(',');
  const hasDot = value.includes('.');
  if (hasComma && hasDot) {
    value = value.replace(/\./g, '').replace(',', '.');
  } else if (hasComma) {
    value = value.replace(',', '.');
  } else if (hasDot) {
    const dots = value.split('.');
    if (dots.length > 2) {
      value = value.replace(/\./g, '');
    }
  }
  if (!value) {
    return '0';
  }
  return `${negative ? '-' : ''}${value}`;
}

function normalizeHeader(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function findColumn(headers: string[], patterns: RegExp[]): number {
  const index = headers.findIndex((header) =>
    patterns.some((pattern) => pattern.test(normalizeHeader(header))),
  );
  return index;
}

function pickAmount(
  row: string[],
  amountCol: number,
  creditCol: number,
  debitCol: number,
): { raw: string; forceNegative: boolean } | null {
  const nonEmpty = (value: string | undefined): string | null =>
    value !== undefined && value.trim() !== '' ? value : null;
  const credit = creditCol >= 0 ? nonEmpty(row[creditCol]) : null;
  const debit = debitCol >= 0 ? nonEmpty(row[debitCol]) : null;
  if (credit) return { raw: credit, forceNegative: false };
  if (debit) return { raw: debit, forceNegative: true };
  const fallback = amountCol >= 0 ? nonEmpty(row[amountCol]) : null;
  return fallback ? { raw: fallback, forceNegative: false } : null;
}

function detectHeaderIndex(rows: string[][]): number {
  for (let i = 0; i < Math.min(rows.length, 10); i += 1) {
    const line = (rows[i] ?? []).join(' ');
    if (
      /(data|date|valor|amount|descri|historico|memo|lancamento|parcela)/i.test(line) &&
      !/^\d{4}-\d{2}-\d{2}/.test(line)
    ) {
      return i;
    }
  }
  return -1;
}

export function parseCsv(content: string): ParsedTransaction[] {
  const lines = content.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length === 0) {
    throw new BadRequestException('Arquivo CSV vazio');
  }
  const delim = detectDelimiter(lines);
  const rows = lines.map((line) => splitLine(line, delim));

  const headerIndex = detectHeaderIndex(rows);
  let dateCol = 0;
  let descCol = 1;
  let amountCol = -1;
  let creditCol = -1;
  let debitCol = -1;

  if (headerIndex >= 0) {
    const headers = rows[headerIndex] ?? [];
    const amountMatch = findColumn(headers, [/^valor/, /valor_/, /^amount/, /montante/, /liquido/]);
    const dateMatch = findColumn(headers, [/^data/, /data_/, /^date/, /lancamento/, /^dt/]);
    const descMatch = findColumn(headers, [
      /^descri/,
      /descricao/,
      /historico/,
      /^memo/,
      /^desc/,
      /beneficiario/,
      /texto/,
    ]);
    creditCol = findColumn(headers, [/^credito/, /^credit/, /^entrada/]);
    debitCol = findColumn(headers, [/^debito/, /^debit/, /^saida/]);
    if (amountMatch >= 0) {
      amountCol = amountMatch;
    } else if (creditCol >= 0) {
      amountCol = creditCol;
    } else if (debitCol >= 0) {
      amountCol = debitCol;
    } else {
      for (let i = headers.length - 1; i >= 0; i -= 1) {
        if ((headers[i] ?? '').trim()) {
          amountCol = i;
          break;
        }
      }
    }
    dateCol = dateMatch >= 0 ? dateMatch : 0;
    descCol = descMatch >= 0 ? descMatch : 1;
  }

  const transactions: ParsedTransaction[] = [];
  for (let i = 0; i < rows.length; i += 1) {
    if (headerIndex >= 0 && i === headerIndex) {
      continue;
    }
    const row = rows[i] ?? [];
    const pick = pickAmount(row, amountCol, creditCol, debitCol);
    if (!pick) {
      continue;
    }
    const rawDate = row[dateCol] ?? '';
    const description = normalizeDescription(row[descCol] ?? '') || 'Importação';
    let amount = parseAmount(pick.raw);
    if (pick.forceNegative && !amount.startsWith('-')) {
      amount = `-${amount}`;
    }
    if (!amount || Number(amount) === 0) {
      continue;
    }
    transactions.push({
      date: parseBrDate(rawDate),
      description,
      amount,
      type: typeFromAmount(amount),
    });
  }
  if (transactions.length === 0) {
    throw new BadRequestException('Nenhuma transação reconhecida no CSV');
  }
  return transactions;
}
