export type PeriodPreset = 'today' | 'month' | '30days' | 'year';
export type DatePeriod = { from: string; to: string };

export function localIsoDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function presetPeriod(preset: PeriodPreset, today = new Date()): DatePeriod {
  const from = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if (preset === 'month') from.setDate(1);
  if (preset === 'year') from.setMonth(0, 1);
  if (preset === '30days') from.setDate(from.getDate() - 29);
  return { from: localIsoDate(from), to: localIsoDate(today) };
}

function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  if (year < 1900 || year > 9998) return false;
  return localIsoDate(new Date(year, month - 1, day)) === value;
}

export function periodError(range: DatePeriod): string {
  if (!validDate(range.from) || !validDate(range.to)) return 'Selecciona fechas válidas en Desde y Hasta.';
  if (range.from > range.to) return 'Desde debe ser anterior o igual a Hasta.';
  return '';
}
