import { LoaderCircle, RefreshCw } from 'lucide-react';

export function RefreshButton({ busy = false, disabled = false, onClick, type = 'button', label = 'Actualizar' }: {
  busy?: boolean; disabled?: boolean; onClick?: () => void; type?: 'button' | 'submit'; label?: string;
}) {
  return <button className="module-refresh" type={type} onClick={() => { window.dispatchEvent(new Event('opervia-sellers-refresh')); onClick?.(); }} disabled={busy || disabled} aria-label={label}>
    {busy ? <LoaderCircle className="spin" size={17} /> : <RefreshCw size={17} />}
    {busy ? 'Actualizando…' : 'Actualizar'}
  </button>;
}
