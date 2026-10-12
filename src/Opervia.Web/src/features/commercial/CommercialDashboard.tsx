import { FilterMultiSelect } from '../filters/FilterMultiSelect';
import { RefreshButton } from '../filters/RefreshButton';
import { useSellerCatalog } from '../sellers/SellerCatalogContext';
import { TablePagination, TableResultCount } from '../tables/TablePagination';
import { useAccess } from '../access/AccessContext';
import { BarChart3, ChevronRight, LoaderCircle, Search } from 'lucide-react';
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getCommercialSummary } from '../../lib/saeApi';
import type { SaeCommercialResult, SaeConnectionRequest } from '../../types/sae';
import './CommercialDashboard.css';
import { DatePeriodFilter, usePeriodFilter } from '../filters/DatePeriodFilter';
const CommercialCustomerProducts = lazy(() => import('./CommercialCustomerProducts')
  .then(module => ({ default: module.CommercialCustomerProducts })));

interface Props { connection: SaeConnectionRequest | null; onRequestConnection: () => void; }
const money = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const percent = new Intl.NumberFormat('es-MX', { style: 'percent', maximumFractionDigits: 2 });
const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
function dateLabel(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function CommercialDashboard({ connection, onRequestConnection }: Props) {
  const isExecutive = useAccess()?.role === 'Ejecutivo';
  const sellerCatalog = useSellerCatalog();
  const abort = useRef<AbortController | null>(null);
  const period = usePeriodFilter('month');
  const { from, to } = period.applied;
  const [filters, setFilters] = useState({ seller: '', brand: '', line: '', customer: '' });
  const [result, setResult] = useState<SaeCommercialResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [customerPage, setCustomerPage] = useState(1);
  const [pageSize, setPageSize] = useState(30);
  const [selectedCustomer, setSelectedCustomer] = useState('');
  const productsSection = useRef<HTMLDivElement>(null);
  const customersSection = useRef<HTMLElement>(null);
  const load = useCallback(async () => {
    if (!connection) return;
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setLoading(true);
    setCustomerPage(1);
    setError('');
    try {
      const next = await getCommercialSummary(connection, from, to, filters, controller.signal);
      if (abort.current === controller && !controller.signal.aborted) setResult(next);
    } catch (e) {
      if (abort.current === controller && !controller.signal.aborted) {
        setError(e instanceof Error ? e.message : 'No fue posible consultar el análisis.');
      }
    } finally {
      if (abort.current === controller) { abort.current = null; setLoading(false); }
    }
  }, [connection, from, to, filters]);
  useEffect(() => { void load(); return () => abort.current?.abort(); }, [load]);

  const data = loading || error ? null : result;
  const customers = useMemo(() => {
    const tokens = normalize(query).split(' ').filter(Boolean);
    return (data?.customers ?? []).filter(c => {
      const text = normalize(`${c.customerCode} ${c.customerName}`);
      return tokens.every(token => text.includes(token));
    });
  }, [data, query]);
  const page = Math.min(customerPage, Math.max(1, Math.ceil(customers.length / pageSize)));
  const pageCustomers = customers.slice((page - 1) * pageSize, page * pageSize);
  const matrixBrands = data?.brands ?? [];
  const visibleTotals = useMemo(() => new Map(matrixBrands.map(b => [b.brand,
    customers.reduce((sum, c) => sum + (c.brands.find(x => x.brand === b.brand)?.salesWithoutTax ?? 0), 0),
  ])), [matrixBrands, customers]);
  const selected = data?.customers.find(c => c.customerCode === selectedCustomer);
  useEffect(() => {
    if (data && selectedCustomer && !selected) setSelectedCustomer('');
  }, [data, selected, selectedCustomer]);
  const scrollTo = (element: HTMLElement | null) => element?.scrollIntoView({
    behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start',
  });
  const selectCustomer = (code: string) => {
    setSelectedCustomer(code);
    window.requestAnimationFrame(() => scrollTo(productsSection.current));
  };

  if (!connection) return <section className="commercial-empty"><BarChart3 size={34} /><h2>Conecta SAE</h2>
    <p>Conecta SAE para consultar la facturación por marca.</p><button onClick={onRequestConnection}>Configurar conexión SAE</button></section>;

  return <section className="commercial-view" aria-busy={loading}>
    <section className="commercial-filters module-filter-bar">
      <DatePeriodFilter filter={period} />
      {!isExecutive && <FilterMultiSelect label="Vendedor" placeholder="Todos los vendedores" value={filters.seller} options={(result?.sellers ?? []).map(x => ({value:x.value,label:sellerCatalog.label(x.value,x.label)}))} onChange={seller => setFilters(x => ({...x,seller}))} />}
      <FilterMultiSelect label="Marca" placeholder="Todas las marcas" value={filters.brand} options={result?.brandOptions ?? []} onChange={brand => setFilters(x => ({...x,brand}))} />
      <FilterMultiSelect label="Línea de producto" placeholder="Todas las líneas" value={filters.line} options={(result?.productLines ?? []).map(x => ({value:x.value,label:`${x.value} · ${x.label}`}))} onChange={line => setFilters(x => ({...x,line}))} />
      <RefreshButton busy={loading} label="Actualizar análisis comercial" onClick={() => void load()} disabled={period.pending || !!period.error} />
    </section>
    {data && <p className="commercial-period-caption">Elaboradas del {dateLabel(data.periodStart)} al {dateLabel(data.periodEnd)} · se excluyen las canceladas.</p>}
    {error && <p className="commercial-error" role="alert">{error}</p>}
    {loading && <p className="commercial-loading" role="status"><LoaderCircle className="spin" size={18} /> Consultando facturas y partidas de SAE…</p>}
    <section className="commercial-kpis">
      <article><span>Facturado sin IVA</span><strong>{data ? money.format(data.salesWithoutTax) : '—'}</strong></article>
      <article><span>Facturado con IVA</span><strong>{data ? money.format(data.salesWithTax) : '—'}</strong></article>
      <article><span>Facturas</span><strong>{data?.invoiceCount ?? '—'}</strong></article>
      <article><span>Clientes</span><strong>{data?.customerCount ?? '—'}</strong></article>
    </section>
    <section className="commercial-panel"><div className="commercial-heading"><div><h2>Facturación por marca</h2>
      <p>Importe sin IVA y participación en el total filtrado.</p></div></div>
      <div className="commercial-chart-scroll" role="region" aria-label="Gráfica de facturación por marca" tabIndex={0}>
      {matrixBrands.map(b => {
        const share = data?.salesWithoutTax ? b.salesWithoutTax / data.salesWithoutTax : 0;
        return <div className="brand-row" key={b.brand}><b>{b.brand}</b>
          <div className="brand-bar" role="img" aria-label={`${b.brand}: ${percent.format(share)} del total`}>
            <i style={{ width: `${Math.max(0, Math.min(100, share * 100))}%` }} /></div>
          <strong>{money.format(b.salesWithoutTax)}</strong><small>{percent.format(share)} · {b.customerCount} clientes</small></div>;
      })}
      {data && !matrixBrands.length && <p className="commercial-no-data">No hay partidas facturadas con esos filtros.</p>}
      </div>
    </section>
    <section ref={customersSection} className="commercial-panel"><div className="commercial-heading"><div><h2>Detalle de facturación por cliente y marca</h2>
      <p>Importes sin IVA. Selecciona un cliente para ver sus productos.</p></div>
      <div className="table-header-tools"><label className="commercial-search"><Search size={16} /><input value={query} onChange={e => { setQuery(e.target.value); setCustomerPage(1); }}
        aria-label="Buscar cliente por clave o nombre" placeholder="Buscar cliente por clave o nombre" /></label><TableResultCount total={customers.length} noun="clientes" busy={loading} /></div></div>
      <div className="commercial-table commercial-matrix" role="region" aria-label="Tabla de facturación por cliente y marca" tabIndex={0}><table>
        <thead><tr><th scope="col">Cliente</th>{matrixBrands.map(b => <th scope="col" key={b.brand}>{b.brand}</th>)}<th scope="col">Total</th></tr></thead>
        <tbody>{pageCustomers.map(c => {
          const byBrand = new Map(c.brands.map(x => [x.brand, x.salesWithoutTax]));
          return <tr key={c.customerCode} className={`commercial-client-row${selectedCustomer === c.customerCode ? ' is-selected' : ''}`}
            onClick={() => selectCustomer(c.customerCode)}><th scope="row"><button className="commercial-client-trigger"
              aria-label={`Ver compras de ${c.customerName}`} aria-pressed={selectedCustomer === c.customerCode}>
              <ChevronRight size={15} /><span><b>{c.customerName}</b><small>{c.customerCode}</small></span></button></th>
            {matrixBrands.map(b => <td key={b.brand} className={byBrand.has(b.brand) ? 'matrix-amount' : ''}>
              {byBrand.has(b.brand) ? money.format(byBrand.get(b.brand) ?? 0) : '—'}</td>)}<td><strong>{money.format(c.salesWithoutTax)}</strong></td></tr>;
        })}
          {data && !customers.length && <tr><td className="commercial-no-data" colSpan={matrixBrands.length + 2}>No hay clientes que coincidan con la búsqueda y los filtros.</td></tr>}
        </tbody>
        {data && customers.length > 0 && <tfoot><tr><th scope="row">{query.trim() ? 'Total de la búsqueda' : 'Total'}</th>
          {matrixBrands.map(b => <td key={b.brand}>{money.format(visibleTotals.get(b.brand) ?? 0)}</td>)}
          <td>{money.format(customers.reduce((sum, c) => sum + c.salesWithoutTax, 0))}</td></tr></tfoot>}
      </table></div>
      <TablePagination page={page} total={customers.length} pageSize={pageSize} onPageChange={setCustomerPage}
        busy={loading} label="clientes" onPageSizeChange={size => { setPageSize(size); setCustomerPage(1); }} />
    </section>
    {selected && data && <div ref={productsSection} className="commercial-products-anchor" key={JSON.stringify([
      selected.customerCode, data.periodStart, data.periodEnd, filters.seller, filters.brand, filters.line,
    ])}>
      <Suspense fallback={<section className="commercial-panel"><p className="commercial-loading" role="status">
        <LoaderCircle className="spin" size={22} /> Abriendo detalle de compras…</p></section>}>
      <CommercialCustomerProducts connection={connection} customerCode={selected.customerCode} customerName={selected.customerName}
        filters={filters} summary={data} onClose={() => {
          setSelectedCustomer(''); window.requestAnimationFrame(() => scrollTo(customersSection.current));
        }} />
      </Suspense>
    </div>}
  </section>;
}

