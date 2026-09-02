import {
  AlertTriangle,
  BarChart3,
  Building2,
  CalendarRange,
  CircleDollarSign,
  Database,
  LoaderCircle,
  Plus,
  RefreshCw,
  ShieldCheck,
  ShoppingCart,
  Trash2,
  TrendingUp,
  UserRound,
  WalletCards,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';

import {
  addManualProfitabilityEntry,
  deleteManualProfitabilityEntry,
  getProfitabilityDashboard,
  listManualProfitabilityEntries,
} from '../../lib/saeApi';
import type {
  ManualProfitabilityEntry,
  ProfitabilityDashboardResult,
  SaeConnectionRequest,
  TaxDisplayMode,
} from '../../types/sae';
import './ProfitabilityDashboard.css';

interface ProfitabilityDashboardProps {
  connection: SaeConnectionRequest | null;
  connectionName: string;
  taxDisplayMode: TaxDisplayMode;
  onRequestConnection: () => void;
}

type ChartDimension = 'month' | 'branch' | 'seller';

const money = new Intl.NumberFormat('es-MX', {
  style: 'currency', currency: 'MXN', maximumFractionDigits: 0,
});
const percent = new Intl.NumberFormat('es-MX', {
  maximumFractionDigits: 1, minimumFractionDigits: 1,
});
const monthName = new Intl.DateTimeFormat('es-MX', { month: 'short' });

function toInputDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function createInitialPeriod() {
  const today = new Date();
  return { from: `${today.getFullYear()}-01-01`, to: toInputDate(today) };
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

export function ProfitabilityDashboard({
  connection,
  connectionName,
  taxDisplayMode,
  onRequestConnection,
}: ProfitabilityDashboardProps) {
  const initialPeriod = useMemo(createInitialPeriod, []);
  const requestRef = useRef<AbortController | null>(null);
  const manualRequestRef = useRef<AbortController | null>(null);
  const [from, setFrom] = useState(initialPeriod.from);
  const [to, setTo] = useState(initialPeriod.to);
  const [branch, setBranch] = useState('');
  const [seller, setSeller] = useState('');
  const [data, setData] = useState<ProfitabilityDashboardResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [chartDimension, setChartDimension] = useState<ChartDimension>('month');
  const [manualEntries, setManualEntries] = useState<ManualProfitabilityEntry[]>([]);
  const [manualError, setManualError] = useState<string | null>(null);
  const [manualSaving, setManualSaving] = useState(false);
  const [manualDate, setManualDate] = useState(toInputDate(new Date()));
  const [manualCategory, setManualCategory] = useState('');
  const [manualAmount, setManualAmount] = useState('');
  const [manualNote, setManualNote] = useState('');

  const load = useCallback(async () => {
    if (!connection) {
      setError('Configura una conexión SAE para consultar rentabilidad.');
      return;
    }
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setLoading(true);
    setError(null);
    try {
      setData(await getProfitabilityDashboard(
        connection, from, to, branch || undefined, seller || undefined, controller.signal,
      ));
    } catch (loadError) {
      if (!isAbortError(loadError)) {
        setError(loadError instanceof Error ? loadError.message : 'No fue posible calcular la rentabilidad.');
      }
    } finally {
      if (requestRef.current === controller) {
        requestRef.current = null;
        setLoading(false);
      }
    }
  }, [branch, connection, from, seller, to]);

  const loadManualEntries = useCallback(async () => {
    manualRequestRef.current?.abort();
    const controller = new AbortController();
    manualRequestRef.current = controller;
    setManualError(null);
    try {
      setManualEntries(await listManualProfitabilityEntries(
        from, to, branch || undefined, controller.signal,
      ));
    } catch (loadError) {
      if (!isAbortError(loadError)) {
        setManualError(loadError instanceof Error ? loadError.message : 'No fue posible leer las capturas manuales.');
      }
    }
  }, [branch, from, to]);

  useEffect(() => {
    if (connection) void load();
    return () => requestRef.current?.abort();
  }, [connection, load]);

  useEffect(() => {
    void loadManualEntries();
    return () => manualRequestRef.current?.abort();
  }, [loadManualEntries]);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!connection) return onRequestConnection();
    void load();
  }

  async function handleManualSubmit(event: FormEvent) {
    event.preventDefault();
    const amount = Number(manualAmount);
    if (!manualCategory.trim() || !Number.isFinite(amount) || amount <= 0) {
      setManualError('Escribe una categoría y un importe mayor a cero.');
      return;
    }
    setManualSaving(true);
    setManualError(null);
    try {
      const entry = await addManualProfitabilityEntry({
        entryDate: manualDate,
        category: manualCategory.trim(),
        branch: branch || undefined,
        amount,
        note: manualNote.trim() || undefined,
      });
      setManualEntries((current) => [entry, ...current]);
      setManualCategory('');
      setManualAmount('');
      setManualNote('');
    } catch (saveError) {
      setManualError(saveError instanceof Error ? saveError.message : 'No fue posible guardar la captura manual.');
    } finally {
      setManualSaving(false);
    }
  }

  async function removeManualEntry(id: string) {
    try {
      await deleteManualProfitabilityEntry(id);
      setManualEntries((current) => current.filter((item) => item.id !== id));
    } catch (deleteError) {
      setManualError(deleteError instanceof Error ? deleteError.message : 'No fue posible eliminar la captura.');
    }
  }

  const monthly = useMemo(() => (data?.monthly ?? []).map((item) => ({
    ...item,
    key: `${item.year}-${item.month}`,
    label: `${monthName.format(new Date(item.year, item.month - 1, 1))} ${String(item.year).slice(-2)}`,
    displayedSales: taxDisplayMode === 'withTax' ? item.netSalesWithTax : item.netSales,
    grossProfit: item.netSales - item.costOfSales,
  })), [data, taxDisplayMode]);

  const distribution = chartDimension === 'branch' ? data?.branches ?? [] : data?.sellers ?? [];
  const displayedDistribution = distribution.map((item) => ({
    ...item,
    displayedSales: taxDisplayMode === 'withTax' ? item.netSalesWithTax : item.netSales,
  }));
  const displayedSales = data
    ? (taxDisplayMode === 'withTax' ? data.netSalesWithTax : data.netSalesWithoutTax)
    : 0;
  const displayedPurchases = data
    ? (taxDisplayMode === 'withTax' ? data.purchasesWithTax : data.purchasesWithoutTax)
    : 0;
  const maximumDistribution = Math.max(...displayedDistribution.map((item) => item.displayedSales), 1);
  const maximumMonthly = Math.max(...monthly.map((item) => item.displayedSales), 1);
  const manualTotal = manualEntries.reduce((total, item) => total + item.amount, 0);
  const invoiceAverage = data?.invoiceCount ? displayedSales / data.invoiceCount : 0;

  return (
    <div className="profitability-view">
      <header className="profitability-hero">
        <div>
          <span className="eyebrow">RENTABILIDAD DESDE SAE</span>
          <h1>Rentabilidad comercial</h1>
          <p>La sección automática utiliza facturas, partidas y compras vigentes registradas en SAE.</p>
        </div>
        <div className="profitability-source-summary">
          <span className={connection ? 'online' : ''} />
          <div><small>Empresa activa</small><strong>{connectionName}</strong></div>
          <ShieldCheck size={20} />
        </div>
      </header>

      <form className="profitability-filters" onSubmit={handleSubmit}>
        <label><span><CalendarRange size={15} /> Desde</span><input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} /></label>
        <label><span><CalendarRange size={15} /> Hasta</span><input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} /></label>
        <label><span><Building2 size={15} /> Sucursal</span><select value={branch} onChange={(e) => setBranch(e.target.value)}><option value="">Todas las sucursales</option>{data?.branchOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
        <label><span><UserRound size={15} /> Vendedor</span><select value={seller} onChange={(e) => setSeller(e.target.value)}><option value="">Todos los vendedores</option>{data?.sellerOptions.map((option) => <option key={`${option.value}-${option.label}`} value={option.value}>{option.label}</option>)}</select></label>
        <button type="submit" disabled={loading || !connection}>{loading ? <LoaderCircle className="spin" size={17} /> : <RefreshCw size={17} />}{loading ? 'Calculando…' : 'Actualizar'}</button>
      </form>

      {!connection && <button className="profitability-connect" type="button" onClick={onRequestConnection}>Conectar con SAE para comenzar</button>}
      {error && <div className="profitability-alert error"><AlertTriangle size={18} />{error}</div>}

      {data && <>
        <section className="profitability-kpis sae-only-kpis">
          <article><div className="profitability-kpi-icon blue"><CircleDollarSign size={22} /></div><span>Facturación {taxDisplayMode === 'withTax' ? 'con IVA' : 'sin IVA'}</span><strong>{money.format(displayedSales)}</strong><small>{data.invoiceCount.toLocaleString('es-MX')} facturas · ticket {money.format(invoiceAverage)}</small></article>
          <article><div className="profitability-kpi-icon amber"><WalletCards size={22} /></div><span>Costo de venta SAE</span><strong>{money.format(data.costOfSales)}</strong><small>Tomado de las partidas no canceladas</small></article>
          <article><div className="profitability-kpi-icon blue"><ShoppingCart size={22} /></div><span>Total comprado {taxDisplayMode === 'withTax' ? 'con IVA' : 'sin IVA'}</span><strong>{money.format(displayedPurchases)}</strong><small>{data.purchaseCount.toLocaleString('es-MX')} compras vigentes emitidas en el periodo · total empresa</small></article>
          <article><div className="profitability-kpi-icon mint"><TrendingUp size={22} /></div><span>Utilidad bruta sin IVA</span><strong>{money.format(data.grossProfit)}</strong><small>Margen bruto {percent.format(data.grossMarginPercent)}%</small></article>
          <article><div className="profitability-kpi-icon violet"><BarChart3 size={22} /></div><span>IVA e impuestos SAE</span><strong>{money.format(data.netSalesWithTax - data.netSalesWithoutTax)}</strong><small>Diferencia fiscal registrada en las facturas</small></article>
        </section>

        <section className="profitability-main-grid sae-main-grid">
          <article className="profitability-panel monthly-panel">
            <div className="profitability-panel-heading"><div><span className="eyebrow">EVOLUCIÓN</span><h2>Facturación y costo por mes</h2></div><span className="record-pill">{monthly.length} meses</span></div>
            <div className="monthly-chart">{monthly.map((item) => <div className="monthly-column" key={item.key}><div className="monthly-values"><span className="sales" style={{ height: `${Math.max(3, item.displayedSales / maximumMonthly * 100)}%` }} title={`Facturación ${money.format(item.displayedSales)}`} /><span className="cost" style={{ height: `${Math.max(3, item.costOfSales / maximumMonthly * 100)}%` }} title={`Costo ${money.format(item.costOfSales)}`} /></div><strong>{item.label}</strong><small>{money.format(item.displayedSales)}</small></div>)}</div>
            <div className="chart-legend"><span className="sales" />Facturación {taxDisplayMode === 'withTax' ? 'con IVA' : 'sin IVA'} <span className="cost" />Costo SAE</div>
          </article>
          <article className="profitability-panel sources-panel">
            <div className="profitability-panel-heading"><div><span className="eyebrow">TRAZABILIDAD</span><h2>Fuente automática</h2></div></div>
            <div className="source-card safe"><Database size={20} /><div><strong>SAE en vivo</strong><span>{data.sources.saeMode}</span><small>{data.sources.saeInvoiceTable} + {data.sources.saeLinesTable} + {data.sources.saePurchaseTable} · {data.elapsedMilliseconds} ms</small></div></div>
            <p><ShieldCheck size={16} /> No se incluyen datos del Excel ni se escribe información en Firebird.</p>
          </article>
        </section>

        <section className="profitability-panel distribution-panel">
          <div className="profitability-panel-heading distribution-heading"><div><span className="eyebrow">ANÁLISIS CONFIGURABLE</span><h2>¿Cómo quieres ver la facturación?</h2></div><div className="dimension-switch" role="group" aria-label="Agrupar gráfica"><button type="button" className={chartDimension === 'month' ? 'active' : ''} onClick={() => setChartDimension('month')}>Meses</button><button type="button" className={chartDimension === 'branch' ? 'active' : ''} onClick={() => setChartDimension('branch')}>Sucursales</button><button type="button" className={chartDimension === 'seller' ? 'active' : ''} onClick={() => setChartDimension('seller')}>Vendedores</button></div></div>
          <div className="ranking-list">{(chartDimension === 'month' ? monthly : displayedDistribution).slice(0, 15).map((item) => {
            const key = item.key;
            const label = item.label;
            const value = item.displayedSales;
            const itemMargin = 'costOfSales' in item && 'netSales' in item && item.netSales ? ((item.netSales - item.costOfSales) / item.netSales) * 100 : 0;
            return <div className="ranking-row" key={`${key}-${label}`}><span>{label}</span><div><i style={{ width: `${value / (chartDimension === 'month' ? maximumMonthly : maximumDistribution) * 100}%` }} /></div><strong>{money.format(value)}</strong><small>{percent.format(itemMargin)}% margen</small></div>;
          })}</div>
        </section>

        <section className="profitability-panel manual-entry-panel">
          <div className="profitability-panel-heading"><div><span className="eyebrow">CAPTURA SEPARADA</span><h2>Datos manuales opcionales</h2></div><div className="manual-total"><small>Total manual del periodo</small><strong>{money.format(manualTotal)}</strong></div></div>
          <p className="manual-entry-note">Estos importes no vienen de SAE y no modifican la utilidad bruta automática. Se guardan aparte en MySQL con fecha y nota.</p>
          <form className="manual-entry-form" onSubmit={handleManualSubmit}>
            <label><span>Fecha</span><input type="date" value={manualDate} onChange={(e) => setManualDate(e.target.value)} /></label>
            <label><span>Categoría</span><input list="manual-categories" value={manualCategory} placeholder="Ej. Gasto extraordinario" onChange={(e) => setManualCategory(e.target.value)} /><datalist id="manual-categories"><option value="Gasto fijo" /><option value="Presupuesto" /><option value="Ajuste administrativo" /><option value="Gasto extraordinario" /></datalist></label>
            <label><span>Importe</span><input type="number" min="0.01" step="0.01" value={manualAmount} placeholder="0.00" onChange={(e) => setManualAmount(e.target.value)} /></label>
            <label className="manual-note-field"><span>Nota</span><input value={manualNote} maxLength={500} placeholder="Motivo o referencia" onChange={(e) => setManualNote(e.target.value)} /></label>
            <button type="submit" disabled={manualSaving}><Plus size={16} />{manualSaving ? 'Guardando…' : 'Agregar'}</button>
          </form>
          {manualError && <div className="profitability-alert error"><AlertTriangle size={17} />{manualError}</div>}
          <div className="manual-entry-list">{manualEntries.map((entry) => <article key={entry.id}><div><strong>{entry.category}</strong><small>{entry.entryDate}{entry.branch ? ` · ${entry.branch}` : ''}{entry.note ? ` · ${entry.note}` : ''}</small></div><b>{money.format(entry.amount)}</b><button type="button" aria-label={`Eliminar ${entry.category}`} onClick={() => void removeManualEntry(entry.id)}><Trash2 size={15} /></button></article>)}{manualEntries.length === 0 && <p>Sin capturas manuales en el periodo seleccionado.</p>}</div>
        </section>
      </>}
    </div>
  );
}
