export type AccessRole = 'Administrador' | 'Gerencia' | 'Ejecutivo';
export interface BasicAccessUser { id: string; name: string; email: string; role: AccessRole; sellerCodes: string[]; active: boolean; }
