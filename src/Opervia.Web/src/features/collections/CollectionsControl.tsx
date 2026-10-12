import { AlertTriangle, CalendarClock, CheckCircle2, ChevronRight, CircleDollarSign, Clock3, Filter, LoaderCircle, OctagonAlert, ShieldCheck, X } from 'lucide-react';
import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { getCollectionsControl } from '../../lib/saeApi';
import type { SaeConnectionRequest } from '../../types/sae';
import { useAccess } from '../access/AccessContext';
import { MultiSelect } from '../filters/MultiSelect';
import { RefreshButton } from '../filters/RefreshButton';
import { customerBranchOptions } from '../filters/customerBranches';
import { useSellerCatalog } from '../sellers/SellerCatalogContext';
import { SellerDescription } from '../sellers/SellerCatalogProvider';
import { TablePagination, TableResultCount } from '../tables/TablePagination';
import { agingBuckets, cents, collectionDate, collectionMoney, collectionView, emptyCollectionFilters, type AgingBucket, type AgingRow, type CollectionPendingCharge, type SaeCollectionsControlResult } from './collections';
import { CollectionsInvoiceItems } from './CollectionsInvoiceItems';
import './CollectionsControl.css';

const ratio = (amount: number, total: number) => total ? amount / total * 100 : 0;
const percentage = (amount: number, total: number) => `${ratio(amount, total).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} %`;
const tones = [CheckCircle2, Clock3, CalendarClock, AlertTriangle, OctagonAlert, AlertTriangle];
const statusNames: Record<string, string> = { A: 'Activo', M: 'Moroso', S: 'Suspendido', B: 'Baja' };
const scrollTo = (target: HTMLElement | null) => target?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
const toneStyle = (tone: string): CSSProperties => ({ '--collection-tone': tone } as CSSProperties);

function AgingCustomerWidget({ bucket, rows, amount, onSelect, selectedCustomer, active, resetKey }: {
  bucket: { key: AgingBucket | 'total'; label: string; color: string }; rows: AgingRow[]; amount: number; onSelect: (key: string) => void; selectedCustomer: string; active: boolean; resetKey: string;
}) {
  const [page, setPage] = useState(1);
  const current = Math.min(page, Math.max(1, Math.ceil(rows.length / 50)));
  const table = useRef<HTMLDivElement>(null);
  useEffect(() => { setPage(1); if (table.current) table.current.scrollTop = 0; }, [resetKey]);
  useEffect(() => setPage(value => Math.min(value, Math.max(1, Math.ceil(rows.length / 50)))), [rows.length]);
  return <section className={`collections-panel collections-aging-widget${active ? ' is-active-range' : ''}`} data-range={bucket.key} style={toneStyle(bucket.color)}>
    <header className="collections-heading"><div><h2>{bucket.label}</h2><p>{collectionMoney(amount)} por cobrar</p></div><TableResultCount total={rows.length} noun="clientes" /></header>
    <div className="collections-aging-list" ref={table}>
      {rows.slice((current - 1) * 50, current * 50).map(row => <button type="button" key={row.key} className={`collections-aging-client${selectedCustomer === row.key ? ' is-selected' : ''}`} aria-pressed={selectedCustomer === row.key} onClick={() => onSelect(row.key)}>
        <span><b>{row.name}</b><small>{row.key}</small></span><strong>{collectionMoney(bucket.key === 'total' ? row.total : row.amounts[bucket.key])}</strong><ChevronRight size={15} />
      </button>)}
      {!rows.length && <p className="collections-empty-row">No hay saldo en este rango.</p>}
    </div>
    <p className="collections-widget-hint">Selecciona un cliente para ver sus facturas</p>
    <TablePagination page={current} total={rows.length} pageSize={50} label={`clientes de ${bucket.label}`} onPageChange={value => { setPage(value); if (table.current) table.current.scrollTop = 0; }} />
  </section>;
}

export function CollectionsControl({ connection, onRequestConnection }: { connection: SaeConnectionRequest | null; onRequestConnection: () => void }) {
  const user = useAccess();
  const sellerCatalog = useSellerCatalog();
  const [report, setReport] = useState<SaeCollectionsControlResult | null>(null);
  const [filters, setFilters] = useState(emptyCollectionFilters);
  const [searchReset, setSearchReset] = useState(0);
  const [loading, setLoading] = useState(false), [error, setError] = useState('');
  const [revision, setRevision] = useState(0), [selectedCustomer, setSelectedCustomer] = useState(''), [selectedInvoice, setSelectedInvoice] = useState('');
  const [range, setRange] = useState('');
  const [sellerPage, setSellerPage] = useState(1), [invoicePage, setInvoicePage] = useState(1);
  const customerAnchor = useRef<HTMLDivElement>(null), detailAnchor = useRef<HTMLElement>(null);
  const request = useRef<AbortController | null>(null);
  const load = useCallback(async () => {
    if (!connection) return;
    request.current?.abort();
    const controller = new AbortController(); request.current = controller; setLoading(true); setError('');
    try { const next = await getCollectionsControl(connection, controller.signal); if (!controller.signal.aborted) { setReport(next); setRevision(value => value + 1); } }
    catch (e) { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'No fue posible consultar la cartera.'); }
    finally { if (request.current === controller) { request.current = null; setLoading(false); } }
  }, [connection]);
  useEffect(() => { setReport(null); setFilters(emptyCollectionFilters); setRange(''); setSelectedCustomer(''); setSelectedInvoice(''); void load(); return () => request.current?.abort(); }, [load]);
  useEffect(() => {
    const refresh = () => { if (document.visibilityState === 'visible' && !request.current) void load(); };
    const timer = window.setInterval(refresh, 60_000);
    document.addEventListener('visibilitychange', refresh); window.addEventListener('online', refresh);
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', refresh); window.removeEventListener('online', refresh); };
  }, [load]);
  const view = useMemo(() => report ? collectionView(report, filters) : null, [report, filters]);
  const sellers = useMemo(() => [...new Map(report?.charges.map(charge => [charge.sellerCode, charge.sellerName])).entries()]
    .sort(([a], [b]) => a.localeCompare(b, 'es-MX', { numeric: true })), [report]);
  const bucketCustomers = useMemo(() => agingBuckets.map(bucket => (view?.customers ?? []).filter(row => row.amounts[bucket.key] > 0)
    .sort((a, b) => b.amounts[bucket.key] - a.amounts[bucket.key])), [view]);
  const currentSellerPage = Math.min(sellerPage, Math.max(1, Math.ceil((view?.sellers.length ?? 0) / 10)));
  useEffect(() => {
    setSellerPage(1); setInvoicePage(1); setSelectedCustomer(''); setSelectedInvoice('');
  }, [filters]);
  useEffect(() => {
    if (report && selectedCustomer && !view?.customers.some(row => row.key === selectedCustomer)) { setSelectedCustomer(''); setSelectedInvoice(''); }
  }, [report, selectedCustomer, view]);
  const select = (code: string) => { setSelectedCustomer(code); setSelectedInvoice(''); setInvoicePage(1); window.requestAnimationFrame(() => scrollTo(detailAnchor.current)); };
  const selectRange = (bucket: string) => { setRange(bucket); window.requestAnimationFrame(() => scrollTo(customerAnchor.current?.querySelector<HTMLElement>(`[data-range="${bucket || 'total'}"]`) ?? customerAnchor.current)); };
  const customer = view?.metadata.get(selectedCustomer);
  const customerRow = view?.customers.find(row => row.key === selectedCustomer);
  const customerInvoices = useMemo(() => {
    const map = new Map<string, { number: string; balance: number; due: string | null; creation: string | null; sellers: Set<string>; charges: CollectionPendingCharge[] }>();
    for (const charge of view?.charges ?? []) {
      if (charge.customerCode !== selectedCustomer) continue;
      const row = map.get(charge.invoiceNumber) ?? { number: charge.invoiceNumber, balance: 0, due: null, creation: charge.creationDate, sellers: new Set<string>(), charges: [] };
      row.balance += cents(charge.balance); row.sellers.add(charge.sellerCode); row.charges.push(charge);
      if (charge.dueDate && (!row.due || charge.dueDate < row.due)) row.due = charge.dueDate;
      map.set(charge.invoiceNumber, row);
    }
    return [...map.values()].sort((a, b) => (a.due ?? '9999').localeCompare(b.due ?? '9999') || a.number.localeCompare(b.number));
  }, [view, selectedCustomer]);
  const invoiceCurrentPage = Math.min(invoicePage, Math.max(1, Math.ceil(customerInvoices.length / 10)));
  const visibleBuckets = agingBuckets.filter(bucket => bucket.key !== 'undated' || (view?.amounts.undated ?? 0) > 0);
  const selectedAccounts = view?.accounts.filter(row => row.customerCode === selectedCustomer) ?? [];
  const selectedLedger = selectedAccounts.reduce((sum, row) => sum + cents(row.ledgerBalance), 0);
  const selectedCredits = selectedAccounts.reduce((sum, row) => sum + cents(row.creditBalance), 0);
  const selectedOther = selectedAccounts.reduce((sum, row) => sum + cents(row.otherBalance), 0);

  if (!connection) return <section className="collections-connect"><ShieldCheck size={38} /><h2>Conecta SAE para consultar la cartera</h2><p>El reporte utiliza los saldos pendientes y los abonos registrados en SAE.</p><button type="button" onClick={onRequestConnection}>Configurar conexión</button></section>;
  return <div className="collections-view" aria-busy={loading}>
    <section className="collections-filters module-filter-bar">
      <MultiSelect label="Sucursal del cliente" placeholder="Todas las sucursales" value={filters.branches ?? []} options={customerBranchOptions.map(([value, label]) => ({ value, label }))} onChange={branches => setFilters(current => ({ ...current, branches }))} />
      <MultiSelect label="Vendedor de la factura" placeholder={user?.role === 'Ejecutivo' ? 'Mis vendedores disponibles' : 'Todos los vendedores'} value={filters.sellers ?? []} disabled={user?.role === 'Ejecutivo' && sellers.length <= 1} options={sellers.map(([code, name]) => ({ value: code || '__unassigned__', label: sellerCatalog.label(code, name) }))} onChange={sellers => setFilters(current => ({ ...current, sellers }))} />
      <MultiSelect label="Estado del cliente en SAE" placeholder="Todos los estados" value={filters.statuses ?? []} options={Object.entries(statusNames).map(([value, label]) => ({ value, label }))} onChange={statuses => setFilters(current => ({ ...current, statuses }))} />
      <MultiSelect label="Cliente" placeholder="Todos los clientes" value={filters.customers ?? []} options={(report?.customers ?? []).map(row => ({ value: row.code, label: `${row.code} · ${row.name}` }))} onChange={customers => setFilters(current => ({ ...current, customers }))} />
      <RefreshButton busy={loading} label="Actualizar control de cobranza" onClick={() => void load()} />
    </section>
    <div className="collections-context"><span><CalendarClock size={15} /> Antigüedad al {report ? collectionDate(report.asOfDate) : 'consultar SAE'} · importes pendientes con IVA</span>
      <span>{report && `Actualizado ${new Date(report.generatedAt).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}`}</span></div>
    {error && <p className="collections-error" role="alert"><AlertTriangle size={18} />{error}{report && ' Se conserva la última consulta; vuelve a actualizar.'}</p>}
    {loading && !report && <div className="collections-loading" role="status"><LoaderCircle className="spin" size={25} /> Consultando la cartera y sus aplicaciones en SAE…</div>}
    {view && report && <>
      <section className="collections-kpis" aria-label="Resumen de antigüedad de saldos">
        <button type="button" className={`collections-kpi total${!range ? ' active' : ''}`} onClick={() => selectRange('')} style={toneStyle('#455fdb')}>
          <span><CircleDollarSign size={18} /> Saldo pendiente total</span><strong>{collectionMoney(view.total)}</strong><small>{view.invoiceCount.toLocaleString('es-MX')} facturas · {view.customers.length.toLocaleString('es-MX')} clientes</small><b>{view.total ? '100.00 %' : '0.00 %'} de la cartera filtrada</b></button>
        {visibleBuckets.map(bucket => {
          const Icon = tones[agingBuckets.indexOf(bucket)];
          return <button type="button" key={bucket.key} className={`collections-kpi${range === bucket.key ? ' active' : ''}`} style={toneStyle(bucket.color)} onClick={() => selectRange(bucket.key)} aria-pressed={range === bucket.key}>
            <span><Icon size={18} />{bucket.label}</span><strong>{collectionMoney(view.amounts[bucket.key])}</strong><small>{bucketCustomers[agingBuckets.indexOf(bucket)].length.toLocaleString('es-MX')} clientes con saldo</small><b>{percentage(view.amounts[bucket.key], view.total)} del total</b></button>;
        })}
      </section>
      <section className="collections-panel collections-distribution"><header className="collections-heading"><div><h2>Distribución de la cartera</h2><p>El porcentaje se calcula sobre el dinero pendiente, no sobre la cantidad de clientes.</p></div>
        <div className="collections-overdue-total"><span>Saldo vencido</span><strong>{collectionMoney(view.overdue)}</strong><small>{percentage(view.overdue, view.total)} de la cartera</small></div></header>
        <div className="collections-distribution-body"><div className="collections-distribution-bar" aria-label="Distribución porcentual de saldos">
          {visibleBuckets.map(bucket => view.amounts[bucket.key] > 0 && <button type="button" key={bucket.key} style={{ background: bucket.color, width: `${ratio(view.amounts[bucket.key], view.total)}%` }} title={`${bucket.label}: ${collectionMoney(view.amounts[bucket.key])} · ${percentage(view.amounts[bucket.key], view.total)}`} aria-label={`Ver ${bucket.label}: ${percentage(view.amounts[bucket.key], view.total)}`} onClick={() => selectRange(bucket.key)} />)}
        </div><div className="collections-legend">{visibleBuckets.map(bucket => <button type="button" key={bucket.key} onClick={() => selectRange(bucket.key)}><i style={{ background: bucket.color }} /><span>{bucket.label}</span><b>{percentage(view.amounts[bucket.key], view.total)}</b></button>)}</div></div>
      </section>

      <div className="collections-search-row collections-client-picker">
        <MultiSelect searchField resetKey={searchReset} label="Buscar y seleccionar clientes" placeholder="Buscar por clave o nombre del cliente…" value={filters.customers ?? []}
          options={(report.customers ?? []).map(row => ({value:row.code,label:`${row.code} · ${row.name}`}))} onChange={customers => setFilters(current => ({...current,customers,search:''}))} />
        <button type="button" className="collections-reset" onClick={() => { setFilters(emptyCollectionFilters); setRange(''); setSearchReset(value => value + 1); }}><Filter size={15} /> Limpiar filtros</button>
      </div>
      <div ref={customerAnchor} className="collections-aging-grid collections-anchor">
        <AgingCustomerWidget bucket={{key:'total',label:'Saldo pendiente total',color:'#455fdb'}} rows={view.customers} amount={view.total} onSelect={select} selectedCustomer={selectedCustomer} active={!range} resetKey={JSON.stringify(filters)} />
        {visibleBuckets.map(bucket => <AgingCustomerWidget key={bucket.key} bucket={bucket} rows={bucketCustomers[agingBuckets.indexOf(bucket)]} amount={view.amounts[bucket.key]} onSelect={select} selectedCustomer={selectedCustomer} active={range === bucket.key} resetKey={JSON.stringify(filters)} />)}
      </div>
      {customer && customerRow && <section ref={detailAnchor} className="collections-panel collections-customer-detail collections-reveal collections-anchor" key={selectedCustomer}>
        <header className="collections-heading"><div><h2>{customer.name}</h2><p>Cliente {customer.code} · {statusNames[customer.status] ?? 'Sin estado'}</p></div><div className="table-header-tools"><TableResultCount total={customerInvoices.length} noun="facturas" /><button type="button" className="collections-close" aria-label="Cerrar detalle del cliente" onClick={() => { setSelectedCustomer(''); setSelectedInvoice(''); scrollTo(customerAnchor.current); }}><X size={18} /></button></div></header>
        <div className="collections-invoice-metrics"><div><span>Facturas pendientes con IVA</span><strong>{collectionMoney(customerRow.total)}</strong></div><div><span>Saldo vencido</span><strong>{collectionMoney(customerRow.overdue)}</strong></div><div><span>Saldos a favor</span><strong>{collectionMoney(selectedCredits)}</strong></div><div><span>Saldo neto de cartera</span><strong>{collectionMoney(selectedLedger)}</strong></div></div>
        {selectedOther !== 0 && <p className="collections-footnote">Otros movimientos de cartera: {collectionMoney(selectedOther)}.</p>}
        <div className="collections-table-scroll collections-invoices-scroll"><table className="collections-table collections-invoices-table"><colgroup><col style={{width:'22%'}} /><col style={{width:'15%'}} /><col style={{width:'19%'}} /><col style={{width:'23%'}} /><col style={{width:'21%'}} /></colgroup><thead><tr><th>Factura</th><th>Elaboración</th><th>Próximo cargo pendiente</th><th>Vendedor</th><th>Saldo pendiente con IVA</th></tr></thead>
          <tbody>{customerInvoices.slice((invoiceCurrentPage - 1) * 10, invoiceCurrentPage * 10).map(row => <Fragment key={row.number}>
            <tr className={`collections-invoice-row${selectedInvoice === row.number ? ' is-selected' : ''}`} tabIndex={0} aria-expanded={selectedInvoice === row.number} aria-controls={`invoice-items-${row.number}`} aria-label={`Factura ${row.number}, mostrar u ocultar partidas`}
              onClick={() => setSelectedInvoice(current => current === row.number ? '' : row.number)}
              onKeyDown={event => { if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); setSelectedInvoice(current => current === row.number ? '' : row.number); } }}>
              <th><button type="button" tabIndex={-1} className="collections-name-link collections-invoice-toggle" aria-expanded={selectedInvoice === row.number}>{row.number}<ChevronRight size={15} className={selectedInvoice === row.number ? 'is-expanded' : ''} /></button></th>
              <td>{collectionDate(row.creation)}</td><td>{collectionDate(row.due)}</td><td><div className="seller-description-list">{[...row.sellers].map(code => <SellerDescription key={code} code={code} />)}</div></td><td><b>{collectionMoney(row.balance)}</b></td>
            </tr>
            {selectedInvoice === row.number && <tr className="collections-invoice-expansion" id={`invoice-items-${row.number}`}><td colSpan={5}><CollectionsInvoiceItems connection={connection} number={row.number} revision={revision} /></td></tr>}
          </Fragment>)}</tbody></table></div>
        <TablePagination page={invoiceCurrentPage} total={customerInvoices.length} pageSize={10} label="facturas del cliente" onPageChange={page => { setInvoicePage(page); setSelectedInvoice(''); }} />
      </section>}


      <section className="collections-panel"><header className="collections-heading"><div><h2>Cartera por vendedor</h2><p>Saldo y porcentaje de cada rango dentro de la cartera del vendedor. Selecciona un vendedor para filtrar el reporte.</p></div><TableResultCount total={view.sellers.length} noun="vendedores" /></header>
        <div className="collections-table-scroll"><table className="collections-table collections-matrix">
          <thead><tr><th>Vendedor</th><th>Saldo pendiente total</th>{visibleBuckets.map(bucket => <th key={bucket.key} style={{ color: bucket.color }}>{bucket.label}<small>Saldo / % del vendedor</small></th>)}</tr></thead>
          <tbody>{view.sellers.slice((currentSellerPage - 1) * 10, currentSellerPage * 10).map(row => <tr key={row.key}>
            <th><button type="button" className="collections-name-link" onClick={() => setFilters(current => ({ ...current, sellers: [row.key || '__unassigned__'] }))}><SellerDescription code={row.key} fallback={row.name} /></button></th><td><b>{collectionMoney(row.total)}</b></td>
            {visibleBuckets.map(bucket => <td key={bucket.key}>{collectionMoney(row.amounts[bucket.key])}<small>{percentage(row.amounts[bucket.key], row.total)}</small></td>)}
          </tr>)}</tbody><tfoot><tr><th>Total filtrado</th><td>{collectionMoney(view.total)}</td>{visibleBuckets.map(bucket => <td key={bucket.key}>{collectionMoney(view.amounts[bucket.key])}<small>{percentage(view.amounts[bucket.key], view.total)}</small></td>)}</tr></tfoot>
        </table>{!view.sellers.length && <p className="collections-empty-row">No hay cartera pendiente con estos filtros.</p>}</div>
        <TablePagination page={currentSellerPage} total={view.sellers.length} pageSize={10} onPageChange={setSellerPage} label="vendedores" />
      </section>
      <p className="collections-footnote">Al corriente incluye cargos que vencen hoy o después. La antigüedad se calcula por el vencimiento de cada cargo. Un cliente o una factura con varios plazos puede aparecer en distintos rangos; cada saldo se cuenta una sola vez. El estado Activo, Moroso o Suspendido corresponde al catálogo de clientes de SAE.</p>
    </>}
  </div>;
}
