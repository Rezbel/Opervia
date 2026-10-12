import { FilterMultiSelect } from '../filters/FilterMultiSelect';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { accessRequest } from '../access/accessApi';
import type { SaeConnectionRequest } from '../../types/sae';
import { SellerCatalogContext, useSellerCatalog } from './SellerCatalogContext';
import { sellerCode, sellerDescription, sellerLabel, type SellerOption } from './sellerLabels';
import './SellerCatalog.css';

export function SellerCatalogProvider({ connection, children }: { connection: SaeConnectionRequest | null; children: ReactNode }) {
  const [snapshot, setSnapshot] = useState<{ connection: SaeConnectionRequest; names: Map<string, string> } | null>(null);
  useEffect(() => {
    setSnapshot(null);
    if (!connection) return;
    const controller = new AbortController(); let pending = false;
    const refresh = async () => {
      if (pending || controller.signal.aborted || document.visibilityState === 'hidden') return;
      pending = true;
      try {
        const rows = await accessRequest<SellerOption[]>('seller-descriptions', { signal: controller.signal });
        if (!controller.signal.aborted) setSnapshot({ connection, names: new Map(rows.map(row => [sellerCode(row.value), row.label.trim()])) });
      } catch { /* Keep the last successful catalog for this connection; labels have an explicit fallback. */ }
      finally { pending = false; }
    };
    const revalidate = () => { void refresh(); };
    void refresh();
    const timer = window.setInterval(revalidate, 60_000);
    document.addEventListener('visibilitychange', revalidate);
    window.addEventListener('online', revalidate);
    window.addEventListener('opervia-sellers-refresh', revalidate);
    return () => { controller.abort(); window.clearInterval(timer); document.removeEventListener('visibilitychange', revalidate); window.removeEventListener('online', revalidate); window.removeEventListener('opervia-sellers-refresh', revalidate); };
  }, [connection]);
  const value = useMemo(() => {
    const names = snapshot && snapshot.connection === connection ? snapshot.names : new Map<string, string>();
    return {
      label: (code: string | null | undefined, fallback = '') => sellerLabel(names, code, fallback),
      description: (code: string | null | undefined, fallback = '') => sellerDescription(names, code, fallback),
    };
  }, [snapshot, connection]);
  return <SellerCatalogContext.Provider value={value}>{children}</SellerCatalogContext.Provider>;
}

export function SellerDescription({ code, fallback = '', inline = false }: { code: string | null | undefined; fallback?: string; inline?: boolean }) {
  const catalog = useSellerCatalog();
  const key = sellerCode(code);
  if (inline || !key || key.toUpperCase() === 'SIN VENDEDOR') return <span className="seller-description-inline">{catalog.label(code, fallback)}</span>;
  return <span className="seller-description" title={catalog.label(code, fallback)}><b>{key}</b><small>{catalog.description(code, fallback)}</small></span>;
}

export function ExecutiveSellerPicker({ codes, value, onChange }: { codes: string[]; value: string; onChange: (value: string) => void }) {
  const catalog = useSellerCatalog();
  return <div className="executive-scope">
    {codes.length === 1 ? <strong>Vendedor {catalog.label(codes[0])}</strong> : <FilterMultiSelect label="Vendedores asignados" placeholder="Todas mis claves" value={value} onChange={onChange} options={codes.map(code => ({value:code,label:catalog.label(code)}))} />}
    <small>Los módulos muestran únicamente información de estas claves.</small>
  </div>;
}
