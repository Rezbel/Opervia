import { FilterMultiSelect } from '../filters/FilterMultiSelect';
import { AlertTriangle, CalendarClock, CalendarDays, ChevronDown, ChevronRight, CircleDollarSign, Filter, LoaderCircle, ReceiptText, Search, UsersRound, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import type { SaeConnectionRequest } from '../../types/sae';
import { useAccess } from '../access/AccessContext';
import { cents, collectionDate, collectionMoney, collectionView, emptyCollectionFilters, normalizeSearch } from '../collections/collections';
import { useCollectionsReport } from '../collections/useCollectionsReport';
import { RefreshButton } from '../filters/RefreshButton';
import { customerBranchOptions } from '../filters/customerBranches';
import { useSellerCatalog } from '../sellers/SellerCatalogContext';
import { SellerDescription } from '../sellers/SellerCatalogProvider';
import { TableResultCount } from '../tables/TablePagination';
import { ScheduleDateFilter } from './ScheduleDateFilter';
import { useSchedulePeriod } from './useSchedulePeriod';
import { dueDay, monthLabel, scheduleCharges, scheduleKeysAtDepth, scheduleView, type ScheduleNode } from './schedule';
import '../collections/CollectionsControl.css';
import './MaturitiesDashboard.css';

const emptyView = scheduleView([], new Map());
const scrollTo = (target: HTMLElement | null) => target?.scrollIntoView({ block: 'start', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });

function MatrixRow({ node, level, open, toggle, sellers }: {
  node: ScheduleNode; level: number; open: Set<string>; toggle: (key: string) => void;
  sellers: { code: string; name: string }[];
}) {
  const expanded = open.has(node.key), expandable = !!node.children.length;
  return <><tr className={`schedule-row schedule-${node.kind}`}>
    <th scope="row"><div className="schedule-tree-label" style={{ '--schedule-depth': level } as CSSProperties}>
      {expandable ? <button type="button" className="schedule-toggle" aria-expanded={expanded} aria-label={`${expanded ? 'Contraer' : 'Desglosar'} ${node.label}`} onClick={() => toggle(node.key)}>{expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</button> : <span className="schedule-toggle-placeholder" />}
      <span><b>{node.label}</b>{node.kind === 'customer' && <small>Cliente {node.customerCode}</small>}{node.kind === 'month' && <small>Total del mes filtrado</small>}</span>
    </div></th>
    {sellers.map(seller => <td key={seller.code} className={node.sellers.has(seller.code) ? '' : 'schedule-zero'}>{node.sellers.has(seller.code) ? collectionMoney(node.sellers.get(seller.code)!) : '—'}</td>)}
    <td className="schedule-total">{collectionMoney(node.total)}</td>
  </tr>{expanded && node.children.map(child => <MatrixRow key={child.key} node={child} level={level + 1} open={open} toggle={toggle} sellers={sellers} />)}</>;
}

export function MaturitiesDashboard({ connection, onRequestConnection }: { connection: SaeConnectionRequest | null; onRequestConnection: () => void }) {
  const user = useAccess();
  const sellerCatalog = useSellerCatalog();
  const { report, loading, error, refresh } = useCollectionsReport(connection);
  const period = useSchedulePeriod(report?.asOfDate);
  const [baseFilters, setBaseFilters] = useState(emptyCollectionFilters);
  const [facets, setFacets] = useState({ months: [] as string[], customers: [] as string[] });
  const [search, setSearch] = useState(''), [focusDay, setFocusDay] = useState('');
  const [open, setOpen] = useState(new Set<string>());
  const matrixAnchor = useRef<HTMLElement>(null), matrixScroll = useRef<HTMLDivElement>(null);
  const base = useMemo(() => report ? collectionView(report, baseFilters) : null, [report, baseFilters]);
  const windowCharges = useMemo(() => scheduleCharges(base?.charges ?? [], { ...period.applied, year: '', months: [], day: '', customers: [] }), [base, period.applied]);
  const facetCharges = useMemo(() => scheduleCharges(windowCharges, { ...period.applied, ...facets, year: '', day: '', customers: [] }), [windowCharges, period.applied, facets]);
  const selectedCharges = useMemo(() => scheduleCharges(facetCharges, { ...period.applied, ...facets, year: '', day: '' }), [facetCharges, period.applied, facets]);
  const calendar = useMemo(() => base ? scheduleView(selectedCharges, base.metadata) : emptyView, [selectedCharges, base]);
  const detail = useMemo(() => focusDay && base ? scheduleView(selectedCharges.filter(charge => dueDay(charge) === focusDay), base.metadata) : calendar, [focusDay, base, selectedCharges, calendar]);
  const sellers = useMemo(() => [...new Map(report?.charges.map(charge => [charge.sellerCode, charge.sellerName])).entries()].sort(([a], [b]) => a.localeCompare(b, 'es-MX', { numeric: true })), [report]);
  const months = useMemo(() => [...new Set(windowCharges.map(charge => dueDay(charge).slice(0, 7)))].sort(), [windowCharges]);
  const clientOptions = useMemo(() => {
    const tokens = normalizeSearch(search).split(' ').filter(Boolean);
    const ids = new Set(facetCharges.map(charge => charge.customerCode));
    return [...ids].map(code => base!.metadata.get(code)!).filter(client => client && tokens.every(token => normalizeSearch(`${client.code} ${client.name}`).includes(token))).sort((a, b) => a.name.localeCompare(b.name, 'es-MX'));
  }, [facetCharges, base, search]);
  const filtersKey = JSON.stringify([baseFilters, period.applied, facets]);
  useEffect(() => { setFocusDay(''); if (matrixScroll.current) matrixScroll.current.scrollTop = 0; }, [filtersKey]);
  const expansionContext = useRef('');
  useEffect(() => {
    const next = scheduleKeysAtDepth(detail.roots, focusDay ? 2 : 0);
    const key = JSON.stringify([filtersKey, focusDay, [...next].sort()]);
    // Keep manual expansion when balances refresh without changing the hierarchy.
    if (expansionContext.current !== key) { expansionContext.current = key; setOpen(next); }
  }, [detail.roots, filtersKey, focusDay]);
  useEffect(() => { setFacets(current => ({ ...current, months: [] })); }, [period.applied.from, period.applied.to]);
  const maxAmount = Math.max(...calendar.days.map(day => day.total), 1);
  const unknown = base?.charges.filter(charge => !dueDay(charge)) ?? [];
  const reset = () => { setBaseFilters(emptyCollectionFilters); setFacets({ months: [], customers: [] }); setSearch(''); setFocusDay(''); period.selectPreset('month'); };
  const toggle = (key: string) => setOpen(current => { const next = new Set(current); if (next.has(key)) next.delete(key); else next.add(key); return next; });
  const selectDay = (date: string) => { setFocusDay(current => current === date ? '' : date); window.requestAnimationFrame(() => scrollTo(matrixAnchor.current)); };

  if (!connection) return <section className="collections-connect"><CalendarClock size={38} /><h2>Conecta SAE para programar los vencimientos</h2><p>Consulta qué clientes y cargos vencen cada día.</p><button type="button" onClick={onRequestConnection}>Configurar conexión</button></section>;
  return <div className="schedule-view" aria-busy={loading}>
    <section className="module-filter-bar schedule-filters">
      <ScheduleDateFilter filter={period} />
      <FilterMultiSelect label="Sucursal del cliente" placeholder="Todas las sucursales" value={baseFilters.branch} options={customerBranchOptions.map(([value,label]) => ({value,label}))} onChange={branch => setBaseFilters(current => ({...current,branch}))} />
      <FilterMultiSelect label="Vendedor de la factura" placeholder={user?.role === 'Ejecutivo' ? 'Mis vendedores disponibles' : 'Todos los vendedores'} value={baseFilters.seller} disabled={user?.role === 'Ejecutivo' && sellers.length <= 1} options={sellers.map(([code,name]) => ({value:code || '__unassigned__',label:sellerCatalog.label(code,name)}))} onChange={seller => setBaseFilters(current => ({...current,seller}))} />
      <RefreshButton busy={loading} onClick={() => void refresh()} label="Actualizar programación de vencimientos" />
    </section>
    <div className="schedule-months" role="group" aria-label="Meses de vencimiento"><span>Mes</span><button type="button" aria-pressed={!facets.months.length} className={!facets.months.length ? 'active' : ''} onClick={() => setFacets(current => ({ ...current, months: [] }))}>Todos</button>{months.map(month => <button type="button" key={month} className={facets.months.includes(month) ? 'active' : ''} aria-pressed={facets.months.includes(month)} onClick={() => setFacets(current => ({ ...current, months: current.months.includes(month) ? current.months.filter(value => value !== month) : [...current.months, month] }))}>{monthLabel(month)}</button>)}<button className="schedule-clear" type="button" onClick={reset}><Filter size={14} /> Limpiar filtros</button></div>
    <div className="collections-context"><span><CalendarClock size={15} /> Vencimientos del {collectionDate(period.applied.from)} al {collectionDate(period.applied.to)} · saldo pendiente con IVA</span><span>{report && `Actualizado ${new Date(report.generatedAt).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}`}</span></div>
    {error && <p className="collections-error" role="alert"><AlertTriangle size={18} />{error}{report && ' Se conserva la última consulta; vuelve a actualizar.'}</p>}
    {loading && !report && <div className="collections-loading" role="status"><LoaderCircle className="spin" size={25} /> Consultando vencimientos y abonos en SAE…</div>}
    {report && base && <>
      {unknown.length > 0 && <p className="schedule-note"><AlertTriangle size={16} /> {unknown.length} cargos pendientes no tienen fecha de vencimiento ({collectionMoney(unknown.reduce((sum, charge) => sum + cents(charge.balance), 0))}). Consúltalos en Control Cobranza; no se asignan a un día del calendario.</p>}
      {focusDay && <div className="schedule-focus" role="status"><CalendarDays size={17} /> Detalle del {collectionDate(focusDay)}<button type="button" onClick={() => setFocusDay('')}><X size={14} /> Volver al periodo completo</button></div>}
      <section className="schedule-kpis" aria-label="Resumen de vencimientos filtrados">
        <article><span><CircleDollarSign size={18} /> Saldo programado</span><strong>{collectionMoney(detail.total)}</strong><small>{detail.chargeCount.toLocaleString('es-MX')} cargos pendientes · con IVA</small></article>
        <article><span><ReceiptText size={18} /> Facturas pendientes</span><strong>{detail.invoiceCount.toLocaleString('es-MX')}</strong><small>Cada factura se cuenta una vez</small></article>
        <article><span><UsersRound size={18} /> Clientes</span><strong>{detail.customerCount.toLocaleString('es-MX')}</strong><small>Con saldo en los vencimientos seleccionados</small></article>
        <article><span><CalendarDays size={18} /> Mayor vencimiento diario</span><strong>{detail.peak ? collectionMoney(detail.peak.total) : '—'}</strong><small>{detail.peak ? collectionDate(detail.peak.date) : 'Sin vencimientos en este rango'}</small></article>
      </section>
      <div className="schedule-overview">
        <section className="collections-panel schedule-client-panel"><header className="collections-heading"><div><h2>Clientes</h2><p>{facets.customers.length ? `${facets.customers.length} seleccionados` : 'Todos los clientes del periodo'}</p></div>{facets.customers.length > 0 && <button type="button" className="collections-close" aria-label="Ver todos los clientes" onClick={() => setFacets(current => ({ ...current, customers: [] }))}><X size={16} /></button>}</header>
          <label className="collections-search"><Search size={16} /><input value={search} placeholder="Buscar por clave o nombre" aria-label="Buscar opciones de clientes" onChange={event => setSearch(event.target.value)} />{search && <button type="button" aria-label="Limpiar búsqueda de clientes" onClick={() => setSearch('')}><X size={14} /></button>}</label>
          <div className="schedule-client-options">{clientOptions.map(client => <label key={client.code}><input type="checkbox" checked={facets.customers.includes(client.code)} onChange={() => setFacets(current => ({ ...current, customers: current.customers.includes(client.code) ? current.customers.filter(code => code !== client.code) : [...current.customers, client.code] }))} /><span>{client.name}<small>Clave {client.code}</small></span></label>)}{!clientOptions.length && <p className="collections-empty-row">No hay clientes que coincidan.</p>}</div><p className="schedule-client-help">Busca y marca uno o varios clientes para filtrar todo el reporte.</p>
        </section>
        <section className="collections-panel schedule-calendar"><header className="collections-heading"><div><h2>Calendario de vencimientos</h2><p>Selecciona un día para revisar sus clientes y facturas.</p></div><TableResultCount total={calendar.days.length} noun="días" /></header>
          <div className="schedule-calendar-meta"><span>Total del periodo <b>{collectionMoney(calendar.total)}</b></span><div><span><i className="past" /> Vencido</span><span><i className="today" /> Vence hoy</span><span><i className="future" /> Por vencer</span></div></div>
          <div className="schedule-calendar-scroll"><div className="schedule-bars">{calendar.days.map(day => <button type="button" key={day.date} className={`schedule-bar${focusDay === day.date ? ' active' : ''}${focusDay && focusDay !== day.date ? ' dimmed' : ''}`} aria-pressed={focusDay === day.date} aria-label={`${collectionDate(day.date)}: ${collectionMoney(day.total)}. Ver clientes.`} title={`${collectionDate(day.date)} · ${collectionMoney(day.total)} · ${day.children.length} clientes`} onClick={() => selectDay(day.date)}>
            <span className="schedule-bar-value">{collectionMoney(day.total)}</span><span className="schedule-bar-track"><i className={day.date < report.asOfDate ? 'past' : day.date === report.asOfDate ? 'today' : 'future'} style={{ height: `${Math.max(2, day.total / maxAmount * 100)}%` }} /></span><b>{day.date.slice(8, 10)}</b><small>{new Date(`${day.date}T12:00:00`).toLocaleDateString('es-MX', { month: 'short', year: '2-digit' })}</small>
          </button>)}</div>{!calendar.days.length && <p className="collections-empty-row">No hay cargos pendientes con vencimiento en estos filtros.</p>}</div>
          <p className="collections-footnote">Cada barra suma los saldos restantes de los cargos que vencen ese día, después de sus abonos. No incluye facturas canceladas ni cargos liquidados.</p>
        </section>
      </div>
      <section className="collections-panel collections-anchor schedule-matrix-panel" ref={matrixAnchor}><header className="collections-heading"><div><h2>Vencimientos por vendedor</h2><p>Abre mes → día → cliente → factura. Los importes corresponden al vencimiento de cada plazo.</p></div><TableResultCount total={detail.invoiceCount} noun="facturas" /></header>
        <div className="collections-table-scroll schedule-matrix-scroll" ref={matrixScroll}><table className="collections-table schedule-matrix"><caption className="schedule-sr-only">Saldo pendiente con IVA por mes, día, cliente y factura; columnas de vendedores. Incluye todos los resultados del filtro, sin paginación.</caption><thead><tr><th scope="col">Mes / Día / Cliente / Factura</th>{detail.sellers.map(seller => <th scope="col" key={seller.code}><SellerDescription code={seller.code} fallback={seller.name} /></th>)}<th scope="col" className="schedule-total">Total con IVA</th></tr></thead>
          <tbody>{detail.roots.map(root => <MatrixRow key={root.key} node={root} level={0} open={open} toggle={toggle} sellers={detail.sellers} />)}</tbody>
          <tfoot><tr><th scope="row">Total del filtro</th>{detail.sellers.map(seller => <td key={seller.code}>{collectionMoney(detail.sellerTotals.get(seller.code) ?? 0)}</td>)}<td className="schedule-total">{collectionMoney(detail.total)}</td></tr></tfoot>
        </table>{!detail.days.length && <p className="collections-empty-row">No hay vencimientos pendientes para mostrar.</p>}</div>
      </section>
    </>}
  </div>;
}
