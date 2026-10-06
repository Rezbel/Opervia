import { AlertTriangle, Ban, CheckCircle2, CircleDollarSign, LoaderCircle, OctagonAlert, RefreshCw, Search, UsersRound } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { getCustomerPortfolio } from '../../lib/saeApi';
import type { SaeConnectionRequest, SaeCustomerPortfolioResult } from '../../types/sae';
import './CustomersDashboard.css';

interface Props { connection: SaeConnectionRequest | null; onRequestConnection: () => void; }
const money = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });
const date = new Intl.DateTimeFormat('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
const options = {
  branch: [['Q', 'Querétaro'], ['H', 'Huasteca'], ['X', 'Xalapa'], ['S', 'San Luis Potosí']],
  state: [['A', 'Activo'], ['M', 'Moroso'], ['S', 'Suspendido'], ['B', 'Baja']],
  customerType: [['L', 'Laboratorio'], ['I', 'Industria'], ['D', 'Distribuidor'], ['H', 'Hospital'], ['C', 'Centro de investigación'], ['E', 'Escuela'], ['V', 'Veterinaria']],
  classification: [['A', 'Acero'], ['R', 'Oro'], ['O', 'Plomo'], ['X', 'Oxidado']],
  credit: [['0', 'Contado'], ['1', '7 días'], ['2', '14 días'], ['3', '30 días'], ['4', '45 días'], ['5', '60 días']],
} as const;
const labels = { branch: 'Sucursal', state: 'Estado SAE', customerType: 'Tipo', classification: 'Clasificación', credit: 'Plazo (clasificación)' };
const emptyFilters = { seller: '', branch: '', state: '', customerType: '', classification: '', credit: '' };
const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleUpperCase('es-MX').replace(/[^A-Z0-9]+/g, ' ').trim();
const isoToday = () => { const value = new Date(); return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`; };
const statusLabel = (value: string) => ({ A: 'Activo', M: 'Moroso', S: 'Suspendido', B: 'Baja' }[value] ?? (value || 'Sin estado'));
const formatDate = (value: string | null) => {
  if (!value) return '—';
  const [year, month, day] = value.slice(0, 10).split('-').map(Number);
  return date.format(new Date(year, month - 1, day));
};
function urgency(dueDate: string | null) {
  if (!dueDate) return 'due';
  const [year, month, day] = dueDate.slice(0, 10).split('-').map(Number);
  const days = Math.round((new Date(year, month - 1, day).getTime() - new Date().setHours(0, 0, 0, 0)) / 86_400_000);
  return days < -90 ? 'critical' : days < 0 ? 'overdue' : days <= 7 ? 'upcoming' : 'due';
}

export function CustomersDashboard({ connection, onRequestConnection }: Props) {
  const [filters, setFilters] = useState<Record<string, string>>(emptyFilters);
  const [sellerInput, setSellerInput] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');
  const [order, setOrder] = useState('source');
  const [customerPage, setCustomerPage] = useState(1);
  const [customersPerPage, setCustomersPerPage] = useState(10);
  const [result, setResult] = useState<SaeCustomerPortfolioResult | null>(null);
  const [detail, setDetail] = useState<SaeCustomerPortfolioResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState('');
  const [detailError, setDetailError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const invoicesSection = useRef<HTMLElement | null>(null);
  const cache = useRef(new Map<string, { at: number; value: SaeCustomerPortfolioResult }>());
  const connectionKey = JSON.stringify(connection);
  const filterKey = JSON.stringify(filters);

  useEffect(() => { cache.current.clear(); setResult(null); setDetail(null); setSelectedCustomer(''); }, [connectionKey]);
  const change = (key: string, value: string) => {
    setSelectedCustomer(''); setDetail(null); setCustomerPage(1);
    setFilters(current => ({ ...current, [key]: value }));
  };
  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (filters.seller !== sellerInput.trim()) change('seller', sellerInput.trim());
    }, 300);
    return () => window.clearTimeout(timer);
  }, [sellerInput, filters.seller]);

  // Reuse recent data immediately, then revalidate every query against SAE.
  function remember(key: string, value: SaeCustomerPortfolioResult) {
    for (const [entryKey, entry] of cache.current) if (Date.now() - entry.at > 60_000) cache.current.delete(entryKey);
    cache.current.delete(key);
    if (cache.current.size >= 64) cache.current.delete(cache.current.keys().next().value!);
    cache.current.set(key, { at: Date.now(), value });
  }

  useEffect(() => {
    if (!connection) return;
    const controller = new AbortController();
    const key = `list:${filterKey}`;
    const cached = cache.current.get(key);
    setResult(cached && Date.now() - cached.at < 60_000 ? cached.value : null);
    setLoading(true); setError('');
    const today = isoToday();
    void getCustomerPortfolio(connection, today, today, filters, controller.signal)
      .then(next => { if (!controller.signal.aborted) { remember(key, next); setResult(next); } })
      .catch(value => { if (!controller.signal.aborted) setError(value instanceof Error ? value.message : 'No fue posible consultar los clientes.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [connectionKey, filterKey, refresh]); // Identity strings exclude unrelated renders.

  useEffect(() => {
    if (!connection || !selectedCustomer) { setDetail(null); setDetailLoading(false); return; }
    const controller = new AbortController();
    const key = `detail:${filterKey}:${selectedCustomer}`;
    const cached = cache.current.get(key);
    setDetail(cached && Date.now() - cached.at < 60_000 ? cached.value : null);
    setDetailLoading(true); setDetailError('');
    const today = isoToday();
    void getCustomerPortfolio(connection, today, today, { ...filters, customer: selectedCustomer }, controller.signal)
      .then(next => {
        if (controller.signal.aborted) return;
        remember(key, next); setDetail(next);
        setResult(previous => previous ? { ...previous, customers: previous.customers.map(row => next.customers.find(updated => updated.customerCode === row.customerCode) ?? row) } : previous);
      })
      .catch(value => { if (!controller.signal.aborted) setDetailError(value instanceof Error ? value.message : 'No fue posible consultar las facturas.'); })
      .finally(() => { if (!controller.signal.aborted) setDetailLoading(false); });
    const frame = window.requestAnimationFrame(() => invoicesSection.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    return () => { controller.abort(); window.cancelAnimationFrame(frame); };
  }, [connectionKey, filterKey, selectedCustomer, refresh]);

  useEffect(() => {
    if (!detail || !selectedCustomer) return;
    const frame = window.requestAnimationFrame(() => invoicesSection.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    return () => window.cancelAnimationFrame(frame);
  }, [detail, selectedCustomer]);

  const indexedCustomers = useMemo(() => result?.customers.map(customer => ({
    customer, text: normalize(`${customer.customerCode} ${customer.customerName}`),
  })) ?? [], [result?.customers]);
  const filteredCustomers = useMemo(() => {
    const tokens = normalize(customerSearch).split(' ').filter(Boolean);
    const rows = indexedCustomers.filter(row => tokens.every(token => row.text.includes(token))).map(row => row.customer);
    if (order === 'balance') rows.sort((a, b) => b.balance - a.balance);
    if (order === 'name') rows.sort((a, b) => a.customerName.localeCompare(b.customerName, 'es-MX'));
    if (order === 'code') rows.sort((a, b) => a.customerCode.localeCompare(b.customerCode, 'es-MX', { numeric: true }));
    return rows;
  }, [indexedCustomers, customerSearch, order]);
  const totalPages = Math.max(1, Math.ceil(filteredCustomers.length / customersPerPage));
  const page = Math.min(customerPage, totalPages);
  const visibleCustomers = filteredCustomers.slice((page - 1) * customersPerPage, page * customersPerPage);
  const selected = detail?.customers.find(customer => customer.customerCode === selectedCustomer);
  const difference = detail?.balanceDifference ?? 0;

  if (!connection) return <section className="customers-empty"><UsersRound size={34} /><h1>Clientes y cartera</h1><p>Conecta SAE para consultar los saldos de tus clientes.</p><button onClick={onRequestConnection}>Configurar conexión SAE</button></section>;
  return <section className="customers-view">
    <header className="customers-hero"><div><span className="eyebrow">CARTERA POR CLIENTE</span><h1>Clientes</h1><p>Consulta el crédito autorizado y saldo actual de SAE. Selecciona un cliente para ver todas sus facturas pendientes.</p></div><div className="customers-source"><CircleDollarSign size={18} />Datos de SAE</div></header>
    <section className="customers-filters">
      <label><span>Vendedor del cliente</span><input value={sellerInput} onChange={event => { setSellerInput(event.target.value); setSelectedCustomer(''); }} placeholder="Clave exacta" /></label>
      {(Object.entries(options) as [keyof typeof options, readonly (readonly string[])[]][]).map(([key, values]) =>
        <label key={key}><span>{labels[key]}</span><select value={filters[key]} onChange={event => change(key, event.target.value)}><option value="">Todos</option>{values.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>)}
      <label><span>Ordenar</span><select value={order} onChange={event => { setOrder(event.target.value); setCustomerPage(1); }}><option value="source">Sin ordenar</option><option value="balance">Mayor saldo primero</option><option value="name">Nombre A–Z</option><option value="code">Clave</option></select></label>
      <button className="customers-refresh" onClick={() => { cache.current.clear(); setRefresh(value => value + 1); }} disabled={loading || detailLoading} aria-label="Actualizar cartera"><RefreshCw className={loading || detailLoading ? 'spin' : ''} size={17} /></button>
    </section>
    {error && <p className="customers-error" role="alert"><AlertTriangle size={17} />{error}</p>}
    <section className="customers-panel">
      <div className="customers-panel-heading"><div><h2>Clientes</h2><p>{filteredCustomers.length} {filteredCustomers.length === 1 ? 'cliente encontrado' : 'clientes encontrados'}{loading ? ' · Actualizando…' : ''}</p></div><label className="customers-search"><Search size={16} /><input value={customerSearch} onChange={event => { setCustomerSearch(event.target.value); setCustomerPage(1); }} placeholder="Buscar por clave o nombre" aria-label="Buscar cliente por clave o nombre" /></label></div>
      <div className="customers-table">
        <div className="customers-head"><span>Cliente</span><span>Vendedor</span><span>Clasificación</span><span>Límite de crédito</span><span>Días de crédito</span><span>Saldo SAE</span><span>Estado SAE</span></div>
        {visibleCustomers.map(customer => <button key={customer.customerCode} className={`customers-row${selectedCustomer === customer.customerCode ? ' selected' : ''}`} aria-pressed={selectedCustomer === customer.customerCode} onClick={() => setSelectedCustomer(customer.customerCode)}>
          <span><strong>{customer.customerName}</strong><small>{customer.customerCode}</small></span><b>{customer.sellerCode || '—'}</b><b>{customer.classification || 'Sin clasificación'}</b>
          <span><b>{money.format(customer.creditLimit)}</b><small>{customer.hasCredit ? 'Crédito habilitado' : 'Sin crédito'}</small></span><b>{customer.creditDays} días</b>
          <span><b className={customer.balance > 0 ? 'balance due' : 'balance'}>{money.format(customer.balance)}</b>{customer.balance < -0.005 && <small>Saldo a favor</small>}</span>
          <b className={`customer-portfolio-status status-${customer.customerStatus.toLowerCase()}`}>{customer.customerStatus === 'M' ? <AlertTriangle size={13} /> : customer.customerStatus === 'S' || customer.customerStatus === 'B' ? <Ban size={13} /> : customer.customerStatus === 'A' ? <CheckCircle2 size={13} /> : null}{statusLabel(customer.customerStatus)}</b>
        </button>)}
        {loading && !result && <div className="customers-invoice-loading"><LoaderCircle size={22} /><span>Consultando clientes en SAE…</span></div>}
        {!loading && filteredCustomers.length === 0 && <p className="customers-no-data">No hay clientes que coincidan con la búsqueda y los filtros.</p>}
      </div>
      {filteredCustomers.length > 0 && <div className="customers-pagination"><span>Página {page} de {totalPages}</span><label>Mostrar <select value={customersPerPage} onChange={event => { setCustomersPerPage(Number(event.target.value)); setCustomerPage(1); }}>{[10, 30, 60, 100].map(size => <option key={size} value={size}>{size}</option>)}</select> por página</label><div><button disabled={page === 1} onClick={() => setCustomerPage(page - 1)}>Anterior</button><button disabled={page >= totalPages} onClick={() => setCustomerPage(page + 1)}>Siguiente</button></div></div>}
    </section>
    {selectedCustomer && <section ref={invoicesSection} className="customers-panel customers-invoices">
      <div className="customers-panel-heading"><div><h2>Facturas pendientes del cliente</h2><p>{selected?.customerName ?? selectedCustomer} · Amarillo: vence en 7 días · rojo: factura vencida.{detailLoading && detail ? ' Actualizando…' : ''}</p></div><span>{selectedCustomer}</span></div>
      {detailError && <p className="customers-error" role="alert">{detailError}</p>}
      {detailLoading && !detail ? <div className="customers-invoice-loading"><LoaderCircle size={22} /><span>Consultando facturas en SAE…</span></div> : detail && <>
        {selected && <div className="customers-reconciliation" aria-label="Conciliación del saldo">
          <span>Saldo SAE<strong>{money.format(selected.balance)}</strong></span>
          <span>Facturas pendientes<strong>{money.format(detail.pendingInvoiceBalance ?? 0)}</strong></span>
          {Math.abs(detail.creditBalance ?? 0) >= 0.005 && <span>Menos saldos a favor<strong>{money.format(detail.creditBalance ?? 0)}</strong></span>}
          {Math.abs(detail.otherAccountBalance ?? 0) >= 0.005 && <span>Otros movimientos de cartera<strong>{money.format(detail.otherAccountBalance ?? 0)}</strong></span>}
          <span>Saldo conciliado<strong>{money.format(detail.accountingBalance ?? 0)}</strong></span>
          <p className={Math.abs(difference) > 0.01 ? 'reconciliation-difference' : ''}>{Math.abs(difference) > 0.01 ? `Diferencia con el saldo SAE: ${money.format(difference)}. Revisa los movimientos de cartera en SAE.` : 'El desglose coincide con el saldo de SAE.'}</p>
        </div>}
        <div className="customers-table"><div className="customers-head invoices"><span>Factura</span><span>Fecha</span><span>Vencimiento</span><span>Vendedor</span><span>Saldo pendiente</span><span>Estado</span></div>
          {detail.invoices.map(invoice => { const tone = urgency(invoice.dueDate); return <div className={`customers-invoice-row invoice-${tone}`} key={invoice.invoiceNumber}>
            <strong>{invoice.invoiceNumber}{tone === 'upcoming' && <AlertTriangle className="invoice-warning-icon" size={14} />}{(tone === 'overdue' || tone === 'critical') && <OctagonAlert className="invoice-danger-icon" size={15} />}</strong>
            <span>{formatDate(invoice.documentDate)}</span><span>{formatDate(invoice.dueDate)}</span><span>{invoice.sellerCode || '—'}</span><b title={`Importe original: ${money.format(invoice.originalAmount)}`}>{money.format(invoice.amount)}</b>
            <span className={`customer-invoice-status ${tone}`}>{tone === 'critical' ? 'Muy vencida' : tone === 'upcoming' ? 'Próxima a vencer' : invoice.status}</span>
          </div>; })}
          {detail.invoices.length === 0 && <p className="customers-no-data">{selected ? 'Este cliente no tiene facturas con saldo pendiente.' : 'El cliente ya no coincide con los filtros aplicados.'}</p>}
        </div>
      </>}
    </section>}
  </section>;
}
