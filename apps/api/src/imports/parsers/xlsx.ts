import { BadRequestException } from '@nestjs/common';
import ExcelJS from 'exceljs';
import { detectHeaderIndex, findColumn, parseAmount, parseBrDate } from './csv';
import { normalizeDescription, typeFromAmount, type ParsedTransaction } from './types';

/**
 * A cell value resolved to a "primitive" shape: native Date/number/string, or
 * null for empty. Formulas, rich text and hyperlinks are unwrapped to their
 * effective value so downstream logic never has to deal with ExcelJS's
 * object-shaped cell values.
 */
type ResolvedCell = string | number | Date | null;

function resolveCellValue(value: ExcelJS.CellValue): ResolvedCell {
  if (value === null || value === undefined) {
    return null;
  }
  if (value instanceof Date) {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'string') {
    return value;
  }
  if (typeof value === 'boolean') {
    return String(value);
  }
  if (typeof value === 'object') {
    if ('richText' in value) {
      return value.richText.map((part) => part.text).join('');
    }
    if ('result' in value) {
      const result = value.result;
      if (result === undefined || (typeof result === 'object' && 'error' in result)) {
        return null;
      }
      return resolveCellValue(result as ExcelJS.CellValue);
    }
    if ('text' in value) {
      return String(value.text);
    }
    if ('error' in value) {
      return null;
    }
  }
  return String(value);
}

function resolvedToText(value: ResolvedCell): string {
  if (value === null) {
    return '';
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  return String(value);
}

function isEmptyCell(value: ResolvedCell | undefined): boolean {
  return value === undefined || value === null || (typeof value === 'string' && value.trim() === '');
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

/**
 * Excel date-typed cells are decoded by ExcelJS into a `Date` whose UTC
 * components reflect the value stored in the sheet (see excelToDate in
 * exceljs' utils.js, which is epoch-day based and UTC-anchored). Reading the
 * *local* components here would shift the date depending on the server's
 * timezone, so we must read the UTC ones.
 */
function isoDateFromNativeDate(date: Date): string {
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
}

function resolveDate(value: ResolvedCell | undefined): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (value instanceof Date) {
    return isoDateFromNativeDate(value);
  }
  if (typeof value === 'string') {
    return parseBrDate(value);
  }
  // A bare numeric serial (cell not formatted/typed as a date) is ambiguous
  // to interpret as a date, so it's intentionally not guessed at here.
  return null;
}

function resolveAmount(value: ResolvedCell | undefined): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value === 'number') {
    return Number.isNaN(value) ? null : value.toFixed(2);
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed ? parseAmount(trimmed) : null;
  }
  return null;
}

function rowValues(row: ExcelJS.Row, columnCount: number): ResolvedCell[] {
  const values: ResolvedCell[] = [];
  for (let col = 1; col <= columnCount; col += 1) {
    values.push(resolveCellValue(row.getCell(col).value));
  }
  return values;
}

function pickXlsxAmount(
  row: ResolvedCell[],
  amountCol: number,
  creditCol: number,
  debitCol: number,
): { value: ResolvedCell; forceNegative: boolean } | null {
  const credit = creditCol >= 0 ? row[creditCol] : undefined;
  const debit = debitCol >= 0 ? row[debitCol] : undefined;
  if (!isEmptyCell(credit)) {
    return { value: credit as ResolvedCell, forceNegative: false };
  }
  if (!isEmptyCell(debit)) {
    return { value: debit as ResolvedCell, forceNegative: true };
  }
  const fallback = amountCol >= 0 ? row[amountCol] : undefined;
  return !isEmptyCell(fallback) ? { value: fallback as ResolvedCell, forceNegative: false } : null;
}

export async function parseXlsx(buffer: Buffer): Promise<ParsedTransaction[]> {
  const workbook = new ExcelJS.Workbook();
  try {
    // exceljs' own ambient `Buffer` augmentation (declared in its .d.ts, meant
    // to extend `ArrayBuffer`) merges with @types/node's generic
    // `Buffer<TArrayBuffer>` and produces a structurally broken type in this
    // TS/@types/node combo — a type-only mismatch, the value is a real
    // Buffer. `as any` is needed because even `unknown as Buffer` still
    // resolves to the same broken merged type.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await workbook.xlsx.load(buffer as any);
  } catch {
    throw new BadRequestException('Arquivo XLSX inválido ou corrompido');
  }

  const worksheet = workbook.worksheets[0];
  if (!worksheet) {
    throw new BadRequestException('Arquivo XLSX vazio');
  }

  const rows: ExcelJS.Row[] = [];
  worksheet.eachRow((row) => {
    rows.push(row);
  });
  if (rows.length === 0) {
    throw new BadRequestException('Arquivo XLSX vazio');
  }

  const columnCount = Math.max(worksheet.columnCount, ...rows.map((row) => row.cellCount));
  const resolvedRows = rows.map((row) => rowValues(row, columnCount));
  const textRows = resolvedRows.map((row) => row.map(resolvedToText));

  const headerIndex = detectHeaderIndex(textRows);
  let dateCol = 0;
  let descCol = 1;
  let amountCol = -1;
  let creditCol = -1;
  let debitCol = -1;

  if (headerIndex >= 0) {
    const headers = textRows[headerIndex] ?? [];
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
  for (let i = 0; i < resolvedRows.length; i += 1) {
    if (headerIndex >= 0 && i === headerIndex) {
      continue;
    }
    const row = resolvedRows[i] ?? [];
    const pick = pickXlsxAmount(row, amountCol, creditCol, debitCol);
    if (!pick) {
      continue;
    }
    const date = resolveDate(row[dateCol]);
    if (!date) {
      continue;
    }
    const description = normalizeDescription(resolvedToText(row[descCol] ?? null)) || 'Importação';
    let amount = resolveAmount(pick.value);
    if (!amount) {
      continue;
    }
    if (pick.forceNegative && !amount.startsWith('-')) {
      amount = `-${amount}`;
    }
    if (Number(amount) === 0) {
      continue;
    }
    transactions.push({
      date,
      description,
      amount,
      type: typeFromAmount(amount),
    });
  }
  if (transactions.length === 0) {
    throw new BadRequestException('Nenhuma transação reconhecida no XLSX');
  }
  return transactions;
}
