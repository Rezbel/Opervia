import type { BasicAccessUser } from './basicAccess';
export const apiBase = (import.meta.env.VITE_API_URL ?? 'http://localhost:5106').replace(/\/+$/, '');
let sellerScope = '';
export function setSellerScope(value: string) { sellerScope = value; }
export async function apiFetch(input: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  if (sellerScope) headers.set('X-Opervia-Seller', sellerScope);
  const response = await fetch(input, { ...init, headers, credentials: 'include' });
  if (response.status === 401 && !input.endsWith('/access/login') && !input.endsWith('/access/me')) window.dispatchEvent(new Event('opervia-session-expired'));
  return response;
}
export async function accessRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await apiFetch(`${apiBase}/api/access/${path}`, { cache: 'no-store', ...init, headers: { 'Content-Type': 'application/json', ...init.headers } });
  if (!response.ok) { const body = await response.json().catch(() => null); throw new Error(body?.message ?? (response.status === 403 ? 'No tienes permiso para realizar esta acción.' : 'No fue posible completar la solicitud.')); }
  return response.status === 204 ? undefined as T : response.json();
}
export async function sessionUser(): Promise<BasicAccessUser | null> {
  const response = await apiFetch(`${apiBase}/api/access/me`, { cache: 'no-store' });
  if (response.status === 401) return null;
  if (!response.ok) throw new Error('No fue posible comprobar la sesión.');
  return response.json();
}
