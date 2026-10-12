export function filterValues(value: string): string[] {
  if (!value) return [];
  if (value.startsWith('[')) { try { return JSON.parse(value) as string[]; } catch { return []; } }
  return [value];
}
