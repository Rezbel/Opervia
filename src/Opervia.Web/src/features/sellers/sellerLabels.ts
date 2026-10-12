export interface SellerOption { value: string; label: string; }
export const sellerCode = (value: string | null | undefined) => value?.trim() ?? '';
export function sellerDescription(names: ReadonlyMap<string, string>, value: string | null | undefined, fallback = '') {
  const code = sellerCode(value);
  if (!code || code.toUpperCase() === 'SIN VENDEDOR') return 'Sin vendedor';
  const name = (names.get(code) || fallback).trim();
  return name && name.toUpperCase() !== code.toUpperCase() ? name : 'Descripción no disponible';
}
export function sellerLabel(names: ReadonlyMap<string, string>, value: string | null | undefined, fallback = '') {
  const code = sellerCode(value);
  return !code || code.toUpperCase() === 'SIN VENDEDOR' ? 'Sin vendedor' : `${code} · ${sellerDescription(names, code, fallback)}`;
}
