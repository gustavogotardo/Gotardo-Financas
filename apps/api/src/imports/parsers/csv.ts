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
    amountCol = amountMatch >= 0 ? amountMatch : headers.length - 1;
    dateCol = dateMatch >= 0 ? dateMatch : 0;
    descCol = descMatch >= 0 ? descMatch : 1;
  }

  const transactions: ParsedTransaction[] = [];
  for (let i = 0; i < rows.length; i += 1) {
    if (headerIndex >= 0 && i === headerIndex) {
      continue;
    }
    const row = rows[i] ?? [];
    const rawAmount = amountCol >= 0 ? row[amountCol] : undefined;
    const rawDate = row[dateCol] ?? '';
    const description = normalizeDescription(row[descCol] ?? '') || 'Importação';
    if (!rawAmount) {
      continue;
    }
    const amount = parseAmount(rawAmount);
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
