import { ChartNoAxesCombined, LoaderCircle, PieChart } from 'lucide-react';
import type { SaeReceivablesSummaryResult } from '../../types/sae';

const money = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });
const shortMoney = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', notation: 'compact', maximumFractionDigits: 1 });
const count = new Intl.NumberFormat('es-MX');
const circumference = 2 * Math.PI * 62;

export function TodayCharts({ result, loading }: { result: SaeReceivablesSummaryResult | null; loading: boolean }) {
  const amounts = result ? [
    { label: 'Facturación vigente', amount: result.netInvoicedAmount, tone: 'blue' },
    { label: 'Ingresos recibidos', amount: result.realIncomeAmount, tone: 'green' },
    { label: 'Cancelaciones del día', amount: result.canceledInPeriodAmount, tone: 'red' },
  ] : [];
  const maximum = Math.max(1, ...amounts.map(row => row.amount));
  const total = result?.invoiceCount ?? 0;
  const active = result?.netInvoiceCount ?? 0;
  const canceled = result?.voidedInvoiceCount ?? 0;
  const activeArc = total > 0 ? active / total * circumference : 0;
  const canceledArc = total > 0 ? canceled / total * circumference : 0;
  const empty = <div className="control-chart-empty">{loading ? <><LoaderCircle className="spin" size={23} /><span>Cargando gráfica…</span></> : <span>Conecta SAE para consultar la gráfica.</span>}</div>;
  return <div className="control-charts-grid" aria-busy={loading}>
    <article className="control-chart"><header><h3><ChartNoAxesCombined size={19} /> Importes de hoy</h3><p>Movimientos del día · importes con IVA</p></header>
      {result ? <><div className="control-amount-bars" role="img" aria-label={amounts.map(row => `${row.label}: ${money.format(row.amount)}`).join('. ')}>
        {amounts.map(row => <div key={row.label} className={`control-amount-row chart-${row.tone}`}><div className="control-amount-caption"><span><i />{row.label}</span><strong>{money.format(row.amount)}</strong></div><div className="control-amount-track"><div style={{ width: `${Math.max(0, row.amount) / maximum * 100}%` }} /></div></div>)}
        {amounts.some(row => row.amount > 0) ? <div className="control-chart-axis"><span>$0</span><span>{shortMoney.format(maximum / 2)}</span><span>{shortMoney.format(maximum)}</span></div> : <p className="control-chart-zero">Sin importes registrados hoy.</p>}
      </div><p className="control-chart-footnote">Los pagos pueden corresponder a facturas de otros días. Las cancelaciones se cuentan por su fecha de cancelación.</p></> : empty}
    </article>
    <article className="control-chart"><header><h3><PieChart size={19} /> Facturas de hoy</h3><p>Estado actual de las facturas elaboradas hoy</p></header>
      {result ? <><div className="control-invoice-donut">
        <svg viewBox="0 0 168 168" role="img" aria-label={`${count.format(total)} facturas: ${count.format(active)} vigentes y ${count.format(canceled)} canceladas`}>
          <circle cx="84" cy="84" r="62" className="donut-track" />
          {total > 0 && <g transform="rotate(-90 84 84)"><circle cx="84" cy="84" r="62" className="donut-active" strokeDasharray={`${activeArc} ${circumference}`} /><circle cx="84" cy="84" r="62" className="donut-canceled" strokeDasharray={`${canceledArc} ${circumference}`} strokeDashoffset={-activeArc} /></g>}
          <text x="84" y="82" textAnchor="middle" className="donut-number">{count.format(total)}</text><text x="84" y="104" textAnchor="middle" className="donut-caption">facturas</text>
        </svg>
        <div className="control-donut-legend"><div className="chart-blue"><span><i />Vigentes</span><strong>{count.format(active)}</strong><small>{total > 0 ? Math.round(active / total * 100) : 0}% del total</small></div><div className="chart-red"><span><i />Canceladas</span><strong>{count.format(canceled)}</strong><small>{total > 0 ? Math.round(canceled / total * 100) : 0}% del total</small></div></div>
      </div>{total === 0 && <p className="control-chart-zero">Todavía no hay facturas elaboradas hoy.</p>}</> : empty}
    </article>
  </div>;
}
