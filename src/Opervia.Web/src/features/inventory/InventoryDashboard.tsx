import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import {
  AlertTriangle,
  Boxes,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  Filter,
  PackageSearch,
  RefreshCw,
  TrendingUp,
} from 'lucide-react';
import { getInventoryAnalytics } from '../../lib/saeApi';
import type {
  SaeConnectionRequest,
  SaeInventoryAnalyticsResult,
  SaeInventoryBreakdownItem,
  SaeInventoryProductPerformance,
  TaxDisplayMode,
} from '../../types/sae';
import './InventoryDashboard.css';

interface InventoryDashboardProps {
  connection: SaeConnectionRequest | null;
  connectionName: string;
  taxDisplayMode: TaxDisplayMode;
  onRequestConnection: () => void;
}

type WinnerMetric = 'profit' | 'sales' | 'units' | 'margin';
type BreakdownDimension = 'seller' | 'warehouse' | 'line';
type BreakdownMetric = 'profit' | 'sales' | 'units' | 'stock';

function dateInputValue(date: Date): string {
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 10);
}

function defaultPeriod() {
  const to = new Date();
  const from = new Date(to);
  from.setDate(from.getDate() - 89);
  return { from: dateInputValue(from), to: dateInputValue(to) };
}

function currency(value: number, compact = false): string {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency', currency: 'MXN', maximumFractionDigits: 0,
    notation: compact ? 'compact' : 'standard',
  }).format(value);
}

function number(value: number, maximumFractionDigits = 1): string {
  return new Intl.NumberFormat('es-MX', { maximumFractionDigits }).format(value);
}

function productMetric(
  item: SaeInventoryProductPerformance,
  metric: WinnerMetric,
  taxMode: TaxDisplayMode,
): number {
  if (metric === 'profit') return item.grossProfit;
  if (metric === 'units') return item.quantitySold;
  if (metric === 'margin') return item.grossMarginPercent;
  return taxMode === 'withTax' ? item.salesWithTax : item.salesWithoutTax;
}

function riskLabel(type: string): string {
  if (type === 'OutOfStock') return 'Agotado con demanda';
  if (type === 'LowStock') return 'Bajo mínimo';
  if (type === 'Overstock') return 'Sobreinventario';
  return 'Sin movimiento';
}

export function InventoryDashboard({
  connection,
  connectionName,
  taxDisplayMode,
  onRequestConnection,
}: InventoryDashboardProps) {
  const initial = useMemo(defaultPeriod, []);
  const requestRef = useRef<AbortController | null>(null);
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [seller, setSeller] = useState('');
  const [warehouse, setWarehouse] = useState('');
  const [line, setLine] = useState('');
  const [result, setResult] = useState<SaeInventoryAnalyticsResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [winnerMetric, setWinnerMetric] = useState<WinnerMetric>('profit');
  const [dimension, setDimension] = useState<BreakdownDimension>('line');
  const [breakdownMetric, setBreakdownMetric] = useState<BreakdownMetric>('profit');

  const load = useCallback(async () => {
    if (!connection) return;
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setIsLoading(true);
    setError(null);
    try {
      setResult(await getInventoryAnalytics(connection, from, to, {
        seller, warehouse, line,
      }, controller.signal));
    } catch (requestError) {
      if ((requestError as Error).name !== 'AbortError') {
        setError(requestError instanceof Error
          ? requestError.message
          : 'No fue posible analizar el inventario.');
      }
    } finally {
      if (requestRef.current === controller) {
        requestRef.current = null;
        setIsLoading(false);
      }
    }
  }, [connection, from, line, seller, to, warehouse]);

  useEffect(() => {
    void load();
    return () => requestRef.current?.abort();
  }, [load]);

  const winners = useMemo(() => {
    if (!result) return [];
    return [...result.products]
      .filter((item) => winnerMetric !== 'margin' || item.salesWithoutTax >= 1000)
      .sort((a, b) => productMetric(b, winnerMetric, taxDisplayMode)
        - productMetric(a, winnerMetric, taxDisplayMode))
      .slice(0, 12);
  }, [result, taxDisplayMode, winnerMetric]);

  const breakdown = useMemo(() => {
    if (!result) return { items: [] as SaeInventoryBreakdownItem[], max: 1 };
    const source = dimension === 'seller'
      ? result.sellers
      : dimension === 'warehouse' ? result.warehouses : result.productLines;
    const value = (item: SaeInventoryBreakdownItem) => {
      if (breakdownMetric === 'profit') return item.grossProfit;
      if (breakdownMetric === 'units') return item.quantitySold;
      if (breakdownMetric === 'stock') return item.stockValue;
      return taxDisplayMode === 'withTax' ? item.salesWithTax : item.salesWithoutTax;
    };
    const items = [...source].filter((item) => value(item) > 0)
      .sort((a, b) => value(b) - value(a)).slice(0, 9);
    return { items, max: Math.max(...items.map(value), 1), value };
  }, [breakdownMetric, dimension, result, taxDisplayMode]);

  const breakdownExplanation = useMemo(() => {
    const group = dimension === 'line'
      ? {
          singular: 'línea de producto',
          plural: 'líneas de producto',
          count: 'productos activos registrados en esta línea',
        }
      : dimension === 'seller'
        ? {
            singular: 'vendedor',
            plural: 'vendedores',
            count: 'productos distintos facturados por este vendedor',
          }
        : {
            singular: 'almacén',
            plural: 'almacenes',
            count: 'productos con existencia o venta en este almacén',
          };
    const metric = breakdownMetric === 'profit'
      ? {
          name: 'utilidad bruta',
          detail: 'venta sin IVA menos el costo de venta registrado por SAE',
        }
      : breakdownMetric === 'sales'
        ? {
            name: 'ventas facturadas',
            detail: taxDisplayMode === 'withTax'
              ? 'importe facturado con IVA; no significa dinero cobrado'
              : 'importe facturado sin IVA; no significa dinero cobrado',
          }
        : breakdownMetric === 'units'
          ? {
              name: 'unidades facturadas',
              detail: 'suma de las cantidades incluidas en facturas vigentes',
            }
          : {
              name: 'valor actual del inventario',
              detail: 'existencia positiva actual multiplicada por el costo promedio de SAE',
            };
    return { group, metric };
  }, [breakdownMetric, dimension, taxDisplayMode]);

  const bestCoverage = useMemo(() => {
    if (!result) return [];
    return [...result.products]
      .filter((item) => item.monthlyVelocity > 0)
      .sort((a, b) => b.monthlyVelocity - a.monthlyVelocity)
      .slice(0, 6);
  }, [result]);

  function applyPeriod(days: number) {
    const end = new Date();
    const start = new Date(end);
    start.setDate(start.getDate() - (days - 1));
    setFrom(dateInputValue(start));
    setTo(dateInputValue(end));
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    void load();
  }

  if (!connection) {
    return (
      <section className="inventory-empty">
        <PackageSearch size={32} />
        <h1>Inventario inteligente</h1>
        <p>Conecta SAE para encontrar productos ganadores, faltantes y capital detenido.</p>
        <button type="button" onClick={onRequestConnection}>Configurar conexión SAE</button>
      </section>
    );
  }

  return (
    <div className="inventory-page">
      <header className="inventory-header">
        <div>
          <span className="eyebrow">INTELIGENCIA DE PRODUCTO</span>
          <h1>Inventario inteligente</h1>
          <p>Decide qué reponer, qué impulsar y dónde está detenido el capital.</p>
        </div>
        <div className="inventory-source"><span /><div><small>SAE en vivo</small><strong>{connectionName}</strong></div><CheckCircle2 size={18} /></div>
      </header>

      <form className="inventory-filters" onSubmit={handleSubmit}>
        <div className="inventory-periods">{[30, 90, 180].map((days) => <button type="button" key={days} onClick={() => applyPeriod(days)}>{days} días</button>)}</div>
        <label>Desde<input type="date" value={from} max={to} onChange={(event) => setFrom(event.target.value)} /></label>
        <label>Hasta<input type="date" value={to} min={from} onChange={(event) => setTo(event.target.value)} /></label>
        <label>Vendedor<select value={seller} onChange={(event) => setSeller(event.target.value)}><option value="">Todos</option>{result?.filterOptions.sellers.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
        <label>Almacén<select value={warehouse} onChange={(event) => setWarehouse(event.target.value)}><option value="">Todos</option>{result?.filterOptions.warehouses.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
        <label>Línea<select value={line} onChange={(event) => setLine(event.target.value)}><option value="">Todas</option>{result?.filterOptions.productLines.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
        <button className="inventory-apply" type="submit" disabled={isLoading}>{isLoading ? <RefreshCw className="spin" size={17} /> : <Filter size={17} />}{isLoading ? 'Analizando' : 'Aplicar'}</button>
      </form>

      {error && <div className="inventory-error"><AlertTriangle size={18} />{error}</div>}

      {result && (
        <>
          <section className="inventory-kpis">
            <article><CircleDollarSign size={21} /><div><span>Capital en inventario</span><strong>{currency(result.inventoryValue)}</strong><small>Costo promedio × existencia positiva</small></div></article>
            <article><Boxes size={21} /><div><span>Productos con venta</span><strong>{number(result.sellingProductCount, 0)}</strong><small>De {number(result.activeProductCount, 0)} productos activos</small></div></article>
            <article className="critical"><AlertTriangle size={21} /><div><span>Agotados con demanda</span><strong>{number(result.outOfStockSellingCount, 0)}</strong><small>Vendidos en el periodo y sin existencia</small></div></article>
            <article className="warning"><Clock3 size={21} /><div><span>Capital sin movimiento</span><strong>{currency(result.dormantStockValue)}</strong><small>{result.inventoryValue === 0 ? '0' : number(result.dormantStockValue * 100 / result.inventoryValue)}% del valor inventariado</small></div></article>
          </section>

          <section className="inventory-main-grid">
            <article className="inventory-panel winners-panel">
              <div className="inventory-panel-heading">
                <div><span className="eyebrow">PRODUCTOS GANADORES</span><h2>Ranking del periodo</h2></div>
                <div className="winner-tabs">
                  {([['profit', 'Utilidad'], ['sales', 'Ventas'], ['units', 'Unidades'], ['margin', 'Margen']] as const).map(([value, label]) => <button type="button" className={winnerMetric === value ? 'active' : ''} key={value} onClick={() => setWinnerMetric(value)}>{label}</button>)}
                </div>
              </div>
              <div className="winner-table">
                <div className="winner-head"><span>Producto</span><span>Venta</span><span>Utilidad</span><span>Margen</span><span>Existencia</span></div>
                {winners.map((item, index) => (
                  <div className="winner-row" key={item.productCode}>
                    <div className="winner-product"><b>{index + 1}</b><div><strong>{item.productCode}</strong><small>{item.description}</small></div></div>
                    <span>{currency(taxDisplayMode === 'withTax' ? item.salesWithTax : item.salesWithoutTax, true)}</span>
                    <span className="positive">{currency(item.grossProfit, true)}</span>
                    <span>{number(item.grossMarginPercent)}%</span>
                    <span>{number(item.currentStock)} {item.unit || ''}</span>
                  </div>
                ))}
              </div>
            </article>

            <aside className="inventory-panel mix-panel">
              <div className="inventory-panel-heading"><div><span className="eyebrow">ANÁLISIS CONFIGURABLE</span><h2>Comparar desempeño</h2></div></div>
              <div className="mix-controls">
                <label>1. ¿Qué quieres comparar?<select value={dimension} onChange={(event) => { const next = event.target.value as BreakdownDimension; setDimension(next); if (next === 'seller' && breakdownMetric === 'stock') setBreakdownMetric('profit'); }}><option value="line">Familias / líneas de producto</option><option value="seller">Vendedores</option><option value="warehouse">Almacenes</option></select></label>
                <label>2. ¿Qué quieres medir?<select value={breakdownMetric} onChange={(event) => setBreakdownMetric(event.target.value as BreakdownMetric)}><option value="profit">Utilidad bruta (venta − costo)</option><option value="sales">Ventas facturadas</option><option value="units">Unidades facturadas</option>{dimension !== 'seller' && <option value="stock">Valor actual del inventario</option>}</select></label>
              </div>
              <div className="mix-explanation">
                <strong>
                  Comparando {breakdownExplanation.group.plural} por {breakdownExplanation.metric.name}
                </strong>
                <p>
                  Cada fila es una {breakdownExplanation.group.singular}. El número de la derecha representa {breakdownExplanation.metric.detail}. La barra compara cada resultado contra el primer lugar, no contra el total.
                </p>
              </div>
              <div className="mix-bars">
                {breakdown.items.map((item) => {
                  const value = breakdown.value?.(item) ?? 0;
                  return <div className="mix-row" key={item.key}><div><span>{item.label}</span><b>{breakdownMetric === 'units' ? `${number(value)} unidades` : currency(value, true)}</b></div><i><em style={{ width: `${Math.max(4, value * 100 / breakdown.max)}%` }} /></i><small>{number(item.productCount, 0)} {breakdownExplanation.group.count}</small></div>;
                })}
              </div>
            </aside>
          </section>

          <section className="inventory-secondary-grid">
            <article className="inventory-panel risk-panel">
              <div className="inventory-panel-heading"><div><span className="eyebrow">ACCIÓN REQUERIDA</span><h2>Riesgos de inventario</h2></div><small>{result.risks.length} prioridades</small></div>
              <div className="risk-list">
                {result.risks.map((item) => <div className="risk-row" key={`${item.riskType}:${item.productCode}`}><span className={`risk-badge ${item.severity.toLowerCase()}`}>{riskLabel(item.riskType)}</span><div><strong>{item.productCode}</strong><small>{item.description}</small></div><div><b>{number(item.currentStock)} exist.</b><small>{item.quantitySold > 0 ? `${number(item.quantitySold)} vendidas` : `${item.daysSinceLastSale ?? '—'} días sin venta`}</small></div><b>{item.stockValue > 0 ? currency(item.stockValue, true) : 'Sin existencia'}</b></div>)}
              </div>
            </article>

            <aside className="inventory-panel velocity-panel">
              <div className="inventory-panel-heading"><div><span className="eyebrow">ROTACIÓN</span><h2>Velocidad y cobertura</h2></div></div>
              {bestCoverage.map((item) => <div className="velocity-row" key={item.productCode}><TrendingUp size={17} /><div><strong>{item.productCode}</strong><small>{number(item.monthlyVelocity)} unidades/mes</small></div><span>{item.coverageDays === null ? 'Sin stock' : `${number(item.coverageDays, 0)} días`}</span></div>)}
              <p className="inventory-method">La cobertura estima cuántos días duraría la existencia actual al ritmo del periodo seleccionado.</p>
            </aside>
          </section>

          <div className="inventory-readonly">SAE en vivo · solo lectura · {result.elapsedMilliseconds} ms · Los filtros de vendedor afectan ventas; la existencia pertenece al almacén.</div>
        </>
      )}
    </div>
  );
}
