/**
 * Soma `months` meses a `date`, preservando o horário (aritmética em UTC).
 * Quando o dia original não existe no mês de destino (ex.: 31 em um mês
 * com 30 dias, ou 29/30/31 de fevereiro), o dia é ajustado ("clampado")
 * para o último dia válido do mês de destino, em vez de deixar o
 * `Date.UTC` normalizar (rolar) para o mês seguinte.
 */
export function addMonthsUtc(date: Date, months: number): Date {
  const targetYear = date.getUTCFullYear();
  const targetMonth = date.getUTCMonth() + months;
  const lastDayOfTargetMonth = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  const day = Math.min(date.getUTCDate(), lastDayOfTargetMonth);
  return new Date(
    Date.UTC(
      targetYear,
      targetMonth,
      day,
      date.getUTCHours(),
      date.getUTCMinutes(),
      date.getUTCSeconds(),
      date.getUTCMilliseconds(),
    ),
  );
}
