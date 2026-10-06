import { ChevronDown, ChevronRight, LoaderCircle, Package, RefreshCw, Search, X } from 'lucide-react';
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { getCommercialCustomerProducts } from '../../lib/saeApi';
import type { SaeCommercialCustomerPurchasesResult, SaeCommercialPurchasedProduct, SaeCommercialResult, SaeConnectionRequest } from '../../types/sae';
import './CommercialCustomerProducts.css';

interface Props {
  connection: SaeConnectionRequest;
  customerCode: string;
  customerName: string;
  filters: Record<string, string>;
  summary: SaeCommercialResult;
  onClose: () => void;
}
const money = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const quantity = new Intl.NumberFormat('es-MX', { maximumFractionDigits: 6 });
const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
function dateLabel(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
}
const productKey = (brand: string, p: SaeCommercialPurchasedProduct) => JSON.stringify([brand, p.productCode, p.unit]);

export function CommercialCustomerProducts({ connection, customerCode, customerName, filters, summary, onClose }: Props) {
  const [result, setResult] = useState<SaeCommercialCustomerPurchasesResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [brand, setBrand] = useState('');
  const [query, setQuery] = useState('');
  const [order, setOrder] = useState('amount');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const section = useRef<HTMLElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(''); setResult(null);
    void getCommercialCustomerProducts(connection, summary.periodStart, summary.periodEnd,
      { ...filters, customer: customerCode }, controller.signal)
      .then(next => { if (!controller.signal.aborted) setResult(next); })
      .catch(e => { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'No fue posible consultar los productos.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [connection, customerCode, summary, filters, refresh]);
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => section.current?.scrollIntoView({
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start',
    }));
    return () => window.cancelAnimationFrame(frame);
  }, [result]);

  const groups = useMemo(() => {
    const tokens = normalize(query).split(/\s+/).filter(Boolean);
    return (result?.brands ?? []).filter(b => !brand || b.brand === brand).map(b => ({
      ...b,
      products: b.products.filter(p => {
        const text = normalize(`${p.productCode} ${p.productName} ${p.productLineName}`);
        return tokens.every(token => text.includes(token));
      }).sort((a, b) => order === 'name' ? a.productName.localeCompare(b.productName, 'es')
        : order === 'frequency' ? b.purchases.length - a.purchases.length || b.salesWithoutTax - a.salesWithoutTax
          : b.salesWithoutTax - a.salesWithoutTax),
    })).filter(b => b.products.length > 0);
  }, [result, brand, query, order]);
  const visibleProducts = groups.flatMap(b => b.products);
  const visibleAmount = visibleProducts.reduce((sum, p) => sum + p.salesWithoutTax, 0);
  const toggle = (key: string) => setExpanded(previous => {
    const next = new Set(previous); if (next.has(key)) next.delete(key); else next.add(key); return next;
  });

  return <section ref={section} className="commercial-panel commercial-customer-products" aria-busy={loading}>
    <div className="commercial-heading"><div>
      <span className="eyebrow">COMPRAS DEL CLIENTE</span><h2>{customerName}</h2>
      <p>Clave {customerCode} · del {dateLabel(summary.periodStart)} al {dateLabel(summary.periodEnd)} · mismos filtros de Comercial.</p>
    </div><div className="commercial-detail-actions">
      <button aria-label="Actualizar productos del cliente" disabled={loading} onClick={() => setRefresh(v => v + 1)}><RefreshCw size={16} className={loading ? 'spin' : ''} /></button>
      <button aria-label="Cerrar detalle del cliente" onClick={onClose}><X size={17} /></button>
    </div></div>
    {loading ? <div className="commercial-products-loading" role="status"><LoaderCircle className="spin" size={24} /> Consultando productos adquiridos en SAE…</div>
      : error ? <div className="commercial-products-error" role="alert"><p>{error}</p><button onClick={() => setRefresh(v => v + 1)}>Reintentar</button></div>
        : result && <>
          <div className="commercial-products-stats">
            <div><span>Productos distintos</span><strong>{result.productCount}</strong></div>
            <div><span>Facturas</span><strong>{result.invoiceCount}</strong></div>
            <div><span>Comprado sin IVA</span><strong>{money.format(result.salesWithoutTax)}</strong></div>
            <div><span>Comprado con IVA</span><strong>{money.format(result.salesWithTax)}</strong></div>
          </div>
          <div className="commercial-products-tools">
            <label className="commercial-search"><Search size={16} /><input value={query} onChange={e => setQuery(e.target.value)}
              aria-label="Buscar producto por clave o nombre" placeholder="Buscar producto por clave o nombre" /></label>
            <label className="commercial-products-order">Ordenar por<select aria-label="Ordenar productos" value={order} onChange={e => setOrder(e.target.value)}>
              <option value="amount">Mayor importe</option><option value="frequency">Más recurrentes</option><option value="name">Nombre A–Z</option></select></label>
          </div>
          <div className="commercial-brand-tabs" aria-label="Filtrar productos por marca">
            <button className={!brand ? 'active' : ''} aria-pressed={!brand} onClick={() => setBrand('')}>Todas las marcas <small>{result.brands.length}</small></button>
            {result.brands.map(b => <button key={b.brand} className={brand === b.brand ? 'active' : ''} aria-pressed={brand === b.brand}
              onClick={() => setBrand(b.brand)}>{b.brand}<small>{b.products.length}</small></button>)}
          </div>
          <p className="commercial-products-hint"><Package size={15} /> Abre un producto para ver sus facturas. Los kits se desglosan en componentes.</p>
          <div className="commercial-products-scroll" role="region" aria-label="Productos adquiridos por marca" tabIndex={0}>
            {groups.map(b => <section className="commercial-product-brand" key={b.brand}>
              <header><h3>{b.brand}</h3><span>{b.products.length} productos · <strong>{money.format(b.products.reduce((sum, p) => sum + p.salesWithoutTax, 0))}</strong> sin IVA</span></header>
              <div className="commercial-product-table-wrap"><table className="commercial-product-table">
                <thead><tr><th scope="col">Producto</th><th scope="col">Cantidad</th><th scope="col">Precio promedio sin IVA</th><th scope="col">Importe sin IVA</th><th scope="col">Última compra</th><th scope="col">Facturas</th></tr></thead>
                <tbody>{b.products.map(p => {
                  const key = productKey(b.brand, p), open = expanded.has(key);
                  return <Fragment key={key}><tr className={`commercial-product-row${open ? ' is-open' : ''}`} onClick={() => toggle(key)}>
                    <th scope="row"><button className="commercial-product-trigger" aria-expanded={open} aria-label={`Ver facturas de ${p.productName}`}>
                      {open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}<span><b>{p.productName}</b><small>{p.productCode}{p.productLineName && ` · ${p.productLineName}`}</small></span></button></th>
                    <td>{quantity.format(p.quantity)}<small>{p.unit}</small></td>
                    <td>{p.averageUnitPrice === null ? '—' : money.format(p.averageUnitPrice)}</td><td><strong>{money.format(p.salesWithoutTax)}</strong></td>
                    <td>{dateLabel(p.lastPurchaseDate)}</td><td>{p.purchases.length}</td>
                  </tr>{open && <tr className="commercial-purchase-detail"><td colSpan={6}>
                    <div className="commercial-purchases"><p>Facturas de {p.productCode} · importes después de descuentos</p>
                      <table><thead><tr><th scope="col">Factura</th><th scope="col">Elaboración</th><th scope="col">Cantidad ({p.unit})</th><th scope="col">Sin IVA</th><th scope="col">Con IVA</th></tr></thead>
                        <tbody>{p.purchases.map(purchase => <tr key={purchase.invoiceNumber}><th scope="row">{purchase.invoiceNumber}</th><td>{dateLabel(purchase.elaborationDate)}</td>
                          <td>{quantity.format(purchase.quantity)}</td><td>{money.format(purchase.salesWithoutTax)}</td><td>{money.format(purchase.salesWithTax)}</td></tr>)}</tbody>
                      </table>
                    </div></td></tr>}</Fragment>;
                })}</tbody>
              </table></div>
            </section>)}
            {!groups.length && <p className="commercial-no-data">{result.productCount ? 'No hay productos que coincidan con esta búsqueda.' : 'Este cliente no tiene productos facturados con los filtros actuales.'}</p>}
          </div>
          <div className="commercial-products-total"><span>{visibleProducts.length} productos mostrados · total sin IVA</span><strong>{money.format(visibleAmount)}</strong></div>
        </>}
  </section>;
}
