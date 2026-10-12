export const modulePaths = {
  control: '/centro-de-control',
  flows: '/flujos',
  receivables: '/cuentas-por-cobrar',
  collections: '/cobranza',
  maturities: '/vencimientos',
  profitability: '/rentabilidad',
  commercial: '/comercial',
  customers: '/clientes',
  ai: '/chat-ia',
} as const;

export type ModuleView = keyof typeof modulePaths;
export type SettingsSection = 'connection' | 'users' | 'permissions';
export const settingsPaths: Record<SettingsSection, string> = {
  connection: '/configuracion/conexion',
  users: '/configuracion/usuarios',
  permissions: '/configuracion/permisos',
};
export const usersPath = '/centro-de-control/usuarios';
export const loginPath = '/iniciar-sesion';

export function resolveAppRoute(pathname: string): { view: ModuleView; settings?: SettingsSection; users?: boolean } | null {
  if (pathname === usersPath) return { view: 'control', users: true };
  for (const [view, path] of Object.entries(modulePaths)) {
    if (pathname === path) return { view: view as ModuleView };
  }
  for (const [section, path] of Object.entries(settingsPaths)) {
    if (pathname === path) return { view: 'control', settings: section as SettingsSection };
  }
  return null;
}

// Only recognized local pages can be used as login or configuration return destinations.
export function safeReturnPath(value: string | null, allowSettings = true): string {
  if (!value?.startsWith('/') || value.startsWith('//')) return modulePaths.control;
  try {
    const url = new URL(value, 'http://opervia.local');
    const route = resolveAppRoute(url.pathname);
    if (url.origin !== 'http://opervia.local' || !route || (!allowSettings && route.settings)) return modulePaths.control;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return modulePaths.control;
  }
}

export function canOpenRoute(route: NonNullable<ReturnType<typeof resolveAppRoute>>, role: string): boolean {
  if (route.settings) return role === 'Administrador';
  if (route.users) return role === 'Administrador' || role === 'Gerencia';
  return role !== 'Ejecutivo' || (route.view !== 'profitability' && route.view !== 'ai');
}
