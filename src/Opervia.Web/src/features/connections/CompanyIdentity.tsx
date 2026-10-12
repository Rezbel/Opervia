import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { Check, LoaderCircle, Unplug } from 'lucide-react';
import { apiBase, apiFetch } from '../access/accessApi';
import type { SaeConnectionRequest } from '../../types/sae';
import './CompanyIdentity.css';

type Identity = { name: string | null; state: 'checking' | 'connected' | 'disconnected' };
const CompanyContext = createContext<Identity>({ name: null, state: 'disconnected' });

export function CompanyProvider({ connection, children }: { connection: SaeConnectionRequest | null; children: ReactNode }) {
  const [identity, setIdentity] = useState<Identity>({ name: null, state: 'disconnected' });
  useEffect(() => {
    if (!connection) { setIdentity({ name: null, state: 'disconnected' }); return; }
    let disposed = false;
    let pending = false;
    const controller = new AbortController();
    setIdentity({ name: null, state: 'checking' });
    const refresh = async () => {
      if (pending || disposed || document.visibilityState === 'hidden') return;
      pending = true;
      try {
        const response = await apiFetch(`${apiBase}/api/sae/company`, { cache: 'no-store', signal: controller.signal });
        if (!response.ok) throw new Error('Consulta no disponible');
        const data = await response.json() as { name: string | null; connected: boolean };
        if (!disposed) setIdentity(previous => ({ name: data.name ?? previous.name, state: data.connected ? 'connected' : 'disconnected' }));
      } catch {
        if (!disposed) setIdentity(previous => ({ ...previous, state: 'disconnected' }));
      } finally { pending = false; }
    };
    const visible = () => { void refresh(); };
    const offline = () => setIdentity(previous => ({ ...previous, state: 'disconnected' }));
    void refresh();
    const timer = window.setInterval(visible, 60_000);
    document.addEventListener('visibilitychange', visible);
    window.addEventListener('online', visible);
    window.addEventListener('offline', offline);
    return () => {
      disposed = true; controller.abort(); window.clearInterval(timer);
      document.removeEventListener('visibilitychange', visible);
      window.removeEventListener('online', visible); window.removeEventListener('offline', offline);
    };
  }, [connection]);
  return <CompanyContext.Provider value={identity}>{children}</CompanyContext.Provider>;
}

export function CompanyBadge() {
  const { name, state } = useContext(CompanyContext);
  const status = state === 'connected' ? 'Conexión con SAE confirmada' : state === 'checking' ? 'Comprobando conexión con SAE' : 'Sin conexión con SAE';
  return <div className={`company-identity ${state}`} role="status" title={`${name ?? 'Empresa'} · ${status}`} aria-label={`${name ?? 'Empresa'} · ${status}`}>
    <span className="company-identity-icon" aria-hidden="true">
      {state === 'connected' ? <Check size={16} strokeWidth={3} /> : state === 'checking' ? <LoaderCircle size={16} /> : <Unplug size={16} />}
    </span>
    <strong>{name ?? (state === 'checking' ? 'Consultando empresa…' : state === 'connected' ? 'Nombre de empresa no disponible' : 'Sin conexión')}</strong>
  </div>;
}
