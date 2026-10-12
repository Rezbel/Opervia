import { useEffect, useRef, useState } from 'react';
import { Banknote, CalendarDays, CircleDollarSign, FileText, LoaderCircle, RefreshCw, UserRoundPlus, UsersRound, X, Ban } from 'lucide-react';
import { useAccess } from '../access/AccessContext';
import { UserAdministration } from '../access/UserAdministration';
import { getReceivablesSummary } from '../../lib/saeApi';
import type { SaeConnectionRequest, SaeReceivablesSummaryResult } from '../../types/sae';
import { TodayCharts } from './TodayCharts';
import './ControlOverview.css';

const money = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 2 });
const count = new Intl.NumberFormat('es-MX');
function localDay() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export function ControlOverview({ connection, usersOpen, onUsersOpenChange }: { connection: SaeConnectionRequest | null; usersOpen: boolean; onUsersOpenChange: (open: boolean) => void }) {
  const user = useAccess();
  const canManage = user?.role === 'Administrador' || user?.role === 'Gerencia';
  const [result, setResult] = useState<SaeReceivablesSummaryResult | null>(null);
  const [loading, setLoading] = useState(false), [error, setError] = useState('');
  const [revision, setRevision] = useState(0), [updated, setUpdated] = useState<Date | null>(null);

  const panel = useRef<HTMLDivElement>(null);
  const today = localDay();
  const source = useRef<{ connection: SaeConnectionRequest | null; day: string } | null>(null);
  useEffect(() => {
    if (source.current?.connection !== connection || source.current?.day !== today) {
      setResult(null); setUpdated(null);
      source.current = { connection, day: today };
    }
    if (!connection) { setLoading(false); setError(''); return; }
    const controller = new AbortController();
    setLoading(true); setError('');
    void getReceivablesSummary(connection, today, today, {}, controller.signal, 1, 10, false)
      .then(next => {
        if (controller.signal.aborted) return;
        if (!next.isSuccessful) throw new Error(next.message);
        setResult(next); setUpdated(new Date());
      }).catch(e => {
        if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'No fue posible consultar los indicadores de hoy.');
      }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [connection, today, revision]);
  useEffect(() => {
    const refresh = () => { if (document.visibilityState === 'visible') setRevision(v => v + 1); };
    const interval = window.setInterval(refresh, 60_000);
    document.addEventListener('visibilitychange', refresh);
    return () => { window.clearInterval(interval); document.removeEventListener('visibilitychange', refresh); };
  }, []);
  useEffect(() => {
    if (!usersOpen) return;
    const frame = requestAnimationFrame(() => panel.current?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' }));
    return () => cancelAnimationFrame(frame);
  }, [usersOpen]);
  const tiles = [
    { label: 'Facturado hoy', value: result && money.format(result.netInvoicedAmount), detail: 'Con IVA · facturas vigentes', icon: CircleDollarSign, tone: 'blue' },
    { label: 'Facturas de hoy', value: result && count.format(result.invoiceCount), detail: result ? `${count.format(result.netInvoiceCount)} vigentes · ${count.format(result.voidedInvoiceCount)} canceladas` : 'Documentos elaborados hoy', icon: FileText, tone: 'purple' },
    { label: 'Cancelaciones hoy', value: result && count.format(result.canceledInPeriodCount), detail: result ? `${money.format(result.canceledInPeriodAmount)} con IVA` : 'Por fecha de cancelación', icon: Ban, tone: 'red' },
    { label: 'Ingresos de hoy', value: result && money.format(result.realIncomeAmount), detail: result ? `${count.format(result.realPaymentCount)} pagos recibidos` : 'Pagos monetarios confirmados', icon: Banknote, tone: 'green' },
    { label: 'Clientes facturados hoy', value: result && count.format(result.billedCustomerCount), detail: 'Clientes únicos · facturas vigentes', icon: UsersRound, tone: 'amber' },
  ];
  return <section className="control-overview">
    <div className="control-overview-heading">
      <div><h2><CalendarDays size={19} /> Resumen de hoy</h2><p>{new Intl.DateTimeFormat('es-MX', { dateStyle: 'long' }).format(new Date(`${today}T12:00:00`))}{user?.role === 'Ejecutivo' ? ' · tus vendedores' : ' · todos los vendedores'}</p></div>
      <div className="control-overview-actions">
        <button type="button" aria-label="Actualizar indicadores de hoy" title="Actualizar indicadores de hoy" onClick={() => setRevision(v => v + 1)} disabled={!connection || loading}><RefreshCw size={19} className={loading ? 'spin' : ''} /></button>
        {canManage && <button type="button" className={usersOpen ? 'active' : ''} aria-label={usersOpen ? 'Cerrar administración de usuarios' : 'Abrir administración de usuarios'} title="Administración de usuarios" aria-expanded={usersOpen} aria-controls="control-users-panel" onClick={() => onUsersOpenChange(!usersOpen)}>{usersOpen ? <X size={20} /> : <UserRoundPlus size={20} />}</button>}
      </div>
    </div>
    {!connection && <p className="control-overview-note">{user?.role === 'Administrador' ? 'Configura la conexión SAE para consultar tus indicadores.' : 'El administrador debe configurar la conexión SAE para consultar los indicadores.'}</p>}
    {error && <p className="control-overview-error" role="alert">{error}{result ? ' Se muestran los datos de la última consulta correcta.' : ''}</p>}
    <div className="control-today-grid" aria-busy={loading}>
      {tiles.map(({ label, value, detail, icon: Icon, tone }) => <article key={label} className={`control-today-card tone-${tone}`}><div className="control-today-label"><span>{label}</span><Icon size={20} /></div><strong>{value ?? (loading ? <LoaderCircle className="spin" size={25} aria-label="Cargando indicador" /> : '—')}</strong><small>{detail}</small></article>)}
    </div>
    <TodayCharts result={result} loading={loading} />
    <p className="control-overview-note" role="status">{loading ? 'Actualizando desde SAE…' : updated ? `Actualizado a las ${updated.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })} · actualización automática cada minuto.` : 'Esperando la primera actualización.'}</p>
    <p className="control-overview-definitions">Facturación por elaboración; cancelaciones por fecha de cancelación; ingresos por aplicación del pago. Se excluyen devoluciones, notas de crédito y anticipos aplicados de los ingresos.</p>
    {canManage && <div ref={panel} id="control-users-panel" className={`control-users-reveal${usersOpen ? ' open' : ''}`} aria-hidden={!usersOpen} inert={!usersOpen}><div>{usersOpen && <UserAdministration onClose={() => onUsersOpenChange(false)} />}</div></div>}
  </section>;
}
