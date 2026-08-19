import { createHash, randomBytes } from 'node:crypto';

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('hex');
}

export function parseDuration(value: string): number {
  const match = /^(\d+)(s|m|h|d)$/.exec(value);
  if (!match || !match[1] || !match[2]) {
    throw new Error(`Duração inválida: ${value}`);
  }
  const amount = Number(match[1]);
  const unit = match[2];
  const multiplier: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 };
  return amount * (multiplier[unit] ?? 0) * 1000;
}
