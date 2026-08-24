import { BadRequestException } from '@nestjs/common';
import * as XLSX from 'xlsx';
import { parseCsv } from './csv';
import type { ParsedTransaction } from './types';

export function parseXlsx(buffer: Buffer): ParsedTransaction[] {
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(buffer, { type: 'buffer' });
  } catch {
    throw new BadRequestException('Arquivo XLSX inválido ou corrompido');
  }

  const sheetName = workbook.SheetNames[0];
  const sheet = sheetName ? workbook.Sheets[sheetName] : undefined;
  if (!sheet) {
    throw new BadRequestException('Arquivo XLSX vazio');
  }

  const csv = XLSX.utils.sheet_to_csv(sheet);
  return parseCsv(csv);
}
