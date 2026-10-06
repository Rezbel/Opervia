import { AlertTriangle, ArrowDownLeft, ArrowUpRight, CalendarClock, CheckCircle2, CircleDollarSign, Clock3, History, Landmark, LoaderCircle, ReceiptText, ShieldCheck, WalletCards } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { getCustomerPortfolio, getReceivableInvoiceAccount } from '../../lib/saeApi';
import type { SaeConnectionRequest, SaeCustomerPortfolioResult, SaeReceivableInvoiceAccountResult, TaxDisplayMode } from '../../types/sae';
import { ReceivablesPortfolioSummary } from './ReceivablesPortfolioSummary';
import './ReceivablesDashboard.css';

interface ReceivablesDashboardProps {
  connection: SaeConnectionRequest | null;
  connectionName: string;
  initialDocumentNumber?: string;
  taxDisplayMode: TaxDisplayMode;
  onTaxDisplayModeChange: (mode: TaxDisplayMode) => void;
  onRequestConnection: () => void;
}

const currencyFormatter = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });
const dateFormatter = new Intl.DateTimeFormat('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
function money(value: number | null | undefined) {
  return value == null ? 'No disponible' : currencyFormatter.format(Math.abs(value) < 0.005 ? 0 : value);
}
function date(value: string | null | undefined) {
  if (!value) return 'Sin fecha';
  const parsed = new Date(value.slice(0, 10) + 'T12:00:00');
  return Number.isNaN(parsed.getTime()) ? 'Sin fecha' : dateFormatter.format(parsed);
}
function overdueDays(value: string | null | undefined): number | null {
  if (!value) return null;
  const [year, month, day] = value.slice(0, 10).split('-').map(Number);
  if (!year || !month || !day) return null;
  const today = new Date();
  return Math.floor((Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()) - Date.UTC(year, month - 1, day)) / 86400000);
}

export function ReceivablesDashboard({ connection, connectionName, taxDisplayMode, onTaxDisplayModeChange, onRequestConnection }: ReceivablesDashboardProps) {
  const requestRef = useRef<AbortController | null>(null);
  const [account, setAccount] = useState<SaeReceivableInvoiceAccountResult | null>(null);
  const [portfolio, setPortfolio] = useState<SaeCustomerPortfolioResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [portfolioLoading, setPortfolioLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [portfolioError, setPortfolioError] = useState<string | null>(null);

  useEffect(() => {
    requestRef.current?.abort();
    setAccount(null); setPortfolio(null); setError(null); setPortfolioError(null);
    setIsLoading(false); setPortfolioLoading(false);
    return () => requestRef.current?.abort();
  }, [connection]);

  async function loadDocument(invoiceNumber: string) {
    if (!connection) { onRequestConnection(); return; }
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setAccount(null); setPortfolio(null); setError(null); setPortfolioError(null);
    setIsLoading(true); setPortfolioLoading(false);
    let invoiceLoaded = false;
    try {
      const result = await getReceivableInvoiceAccount(connection, invoiceNumber, controller.signal);
      if (controller.signal.aborted) return;
      if (!result.isSuccessful || !result.invoice) throw new Error(result.message);
      invoiceLoaded = true;
      setAccount(result); setIsLoading(false); setPortfolioLoading(true);
      const today = new Date();
      const todayIso = [today.getFullYear(), String(today.getMonth() + 1).padStart(2, '0'), String(today.getDate()).padStart(2, '0')].join('-');
      const customer = await getCustomerPortfolio(connection, todayIso, todayIso, { customer: result.invoice.customerCode }, controller.signal);
      if (!controller.signal.aborted) setPortfolio(customer);
    } catch (failure) {
      if (!controller.signal.aborted) {
        const message = failure instanceof Error ? failure.message : 'No fue posible consultar SAE.';
        if (invoiceLoaded) setPortfolioError(message); else setError(message);
      }
    } finally {
      if (requestRef.current === controller) {
        requestRef.current = null; setIsLoading(false); setPortfolioLoading(false);
      }
    }
  }

  const invoice = account?.invoice;
  const lastCredit = useMemo(() => [...(account?.movements ?? [])].filter(row => row.signedAmount < 0)
    .sort((a, b) => (b.applicationDate ?? '').localeCompare(a.applicationDate ?? ''))[0], [account]);
  const aging = useMemo(() => {
    const buckets = [
      { label: 'Por vencer', amount: 0, count: 0, tone: 'current' },
      { label: '1–30 días', amount: 0, count: 0, tone: 'mild' },
      { label: '31–60 días', amount: 0, count: 0, tone: 'warning' },
      { label: '61–90 días', amount: 0, count: 0, tone: 'strong' },
      { label: 'Más de 90', amount: 0, count: 0, tone: 'danger' },
    ];
    for (const row of portfolio?.pendingCharges ?? []) {
      if (row.amount <= 0.005) continue;
      const days = overdueDays(row.dueDate);
      const index = days == null || days <= 0 ? 0 : days <= 30 ? 1 : days <= 60 ? 2 : days <= 90 ? 3 : 4;
      buckets[index].amount += row.amount;
      buckets[index].count++;
    }
    return buckets;
  }, [portfolio]);
  const agingTotal = aging.reduce((sum, row) => sum + row.amount, 0);
  const dueDays = overdueDays(invoice?.nextDueDate);
  const tone = invoice?.status === 'Liquidada' ? 'success' : invoice?.status === 'Cancelada' ? 'danger' : invoice?.status === 'Vencido' ? 'warning' : invoice?.status === 'Adeudo' ? 'info' : 'neutral';

  return <div className="receivables-view">
    <header className="receivables-hero">
      <div><span className="eyebrow">CONTROL DE CARTERA</span><h1>Cuentas por cobrar</h1>
        <p>Consulta facturas, abonos y saldos vigentes directamente desde SAE.</p></div>
      <div className="receivables-connection"><span className={connection ? 'online' : ''} />
        <div><small>Fuente de datos</small><strong>{connectionName}</strong></div><ShieldCheck size={20} /></div>
    </header>
    <ReceivablesPortfolioSummary connection={connection} taxDisplayMode={taxDisplayMode}
      onTaxDisplayModeChange={onTaxDisplayModeChange} onRequestConnection={onRequestConnection}
      onSelectDocument={number => {
        void loadDocument(number);
        window.requestAnimationFrame(() => document.getElementById('receivable-document-search')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
      }} />
    <div id="receivable-document-search" className="receivable-document-search-heading">
      <div><span className="eyebrow">EXPEDIENTE INDIVIDUAL</span><h2>Consultar una factura</h2></div>
      <p>Revisa el total de la factura, todos sus cargos y abonos.</p>
    </div>
    {error && <div className="receivables-alert" role="alert"><AlertTriangle size={18} /><span>{error}</span></div>}
    {!invoice && <section className="receivables-empty" aria-busy={isLoading}>
      <div className="receivables-empty-visual">{isLoading ? <LoaderCircle className="spin" size={42} /> : <WalletCards size={42} />}</div>
      <h2>{isLoading ? 'Leyendo la cuenta en SAE…' : 'Selecciona una factura para abrir su cuenta'}</h2>
      <p>Se muestran todos los cargos, incluidos los pagos a plazos, y sus abonos relacionados.</p>
    </section>}
    {invoice && <>
      <section className="receivables-status-row">
        <div><span className={'receivable-status ' + tone}>{invoice.status === 'Liquidada' ? <CheckCircle2 size={15} /> : <Clock3 size={15} />}{invoice.status}</span>
          <strong>{invoice.invoiceNumber}</strong><small>{invoice.customerName} · Cliente {invoice.customerCode} · Estado SAE {invoice.saeStatus}</small></div>
        <p>Consultado en {account?.elapsedMilliseconds} ms</p>
      </section>
      <section className="receivable-metrics">
        <article><div className="receivable-metric-icon blue"><CircleDollarSign size={21} /></div>
          <span>Total factura {taxDisplayMode === 'withTax' ? 'con IVA' : 'sin IVA'}</span>
          <strong>{money(taxDisplayMode === 'withTax' ? invoice.amountWithVat : invoice.amountWithoutVat)}</strong>
          <small>{taxDisplayMode === 'withTax' ? 'Sin IVA: ' + money(invoice.amountWithoutVat) : 'Con IVA: ' + money(invoice.amountWithVat)} · IVA: {money(invoice.vatAmount)}</small></article>
        <article><div className="receivable-metric-icon mint"><Landmark size={21} /></div>
          <span>{invoice.balance != null && invoice.balance < 0 ? 'Saldo a favor con IVA' : 'Saldo pendiente con IVA'}</span>
          <strong>{money(invoice.balance == null ? null : Math.abs(invoice.balance))}</strong>
          <small>{money(invoice.appliedReductions)} en abonos y reducciones con IVA</small></article>
        <article><div className="receivable-metric-icon amber"><CalendarClock size={21} /></div>
          <span>Próximo vencimiento pendiente</span><strong className="metric-date">{invoice.nextDueDate ? date(invoice.nextDueDate) : invoice.balance == null ? 'No disponible' : 'Sin pendientes'}</strong>
          <small>{dueDays == null ? 'Vencimientos de los cargos pendientes' : dueDays > 0 ? dueDays + ' días de atraso' : dueDays === 0 ? 'Vence hoy' : 'Vence en ' + Math.abs(dueDays) + ' días'}</small></article>
        <article><div className="receivable-metric-icon violet"><History size={21} /></div>
          <span>Último abono</span><strong className="metric-date">{lastCredit ? date(lastCredit.applicationDate) : 'Sin abonos'}</strong>
          <small>{lastCredit ? money(Math.abs(lastCredit.signedAmount)) + ' con IVA' : 'Sin reducciones vinculadas'}</small></article>
      </section>
      {invoice.balance != null && Math.abs(invoice.originalCharges - invoice.amountWithVat) > 0.01 &&
        <div className="receivables-alert" role="alert"><AlertTriangle size={18} /><span>Los cargos registrados ({money(invoice.originalCharges)}) difieren del total de la factura ({money(invoice.amountWithVat)}). El saldo se calcula con los cargos y abonos de SAE.</span></div>}
      <section className="receivables-grid">
        <article className="receivable-panel aging-panel" aria-busy={portfolioLoading}>
          <div className="receivable-panel-heading"><div><span className="eyebrow">ANTIGÜEDAD DEL CLIENTE</span><h2>Saldo pendiente por vencimiento</h2></div>
            <span className="record-limit">{portfolioLoading ? <><LoaderCircle size={14} className="spin" /> Cargando…</> : aging.reduce((sum, row) => sum + row.count, 0) + ' cargos pendientes'}</span></div>
          {portfolioError ? <p className="table-empty" role="alert">{portfolioError}</p> : portfolioLoading ? <p className="table-empty">Consultando el saldo vigente del cliente…</p> : <>
            <div className="aging-bar" aria-label="Distribución por antigüedad">{aging.filter(row => row.amount > 0).map(row =>
              <span key={row.tone} className={row.tone} style={{ width: (agingTotal > 0 ? row.amount / agingTotal * 100 : 0) + '%' }} title={row.label + ': ' + money(row.amount)} />)}</div>
            <div className="aging-list">{aging.map(row => <div key={row.tone}><i className={row.tone} /><span>{row.label}</span><b>{money(row.amount)}</b><small>{row.count} {row.count === 1 ? 'cargo' : 'cargos'}</small></div>)}</div>
            <p className="calculation-note">Saldo restante con IVA de los cargos pendientes del cliente. Cada plazo conserva su vencimiento y descuenta sus abonos.</p>
          </>}
        </article>
        <article className="receivable-panel document-detail-panel">
          <div className="receivable-panel-heading"><div><span className="eyebrow">DOCUMENTO CONSULTADO</span><h2>Ficha de la factura</h2></div><ReceiptText size={20} /></div>
          <dl className="document-facts">
            <div><dt>Cliente</dt><dd title={invoice.customerName}>{invoice.customerCode} · {invoice.customerName}</dd></div>
            <div><dt>Vendedor (clave)</dt><dd>{invoice.sellerCode || '—'}</dd></div>
            <div><dt>Elaboración</dt><dd>{date(invoice.creationDate)}</dd></div>
            <div><dt>Fecha de factura</dt><dd>{date(invoice.documentDate)}</dd></div>
            <div><dt>Cargos registrados</dt><dd>{invoice.chargeCount}</dd></div>
            <div><dt>UUID</dt><dd className="fact-uuid" title={invoice.uuid ?? undefined}>{invoice.uuid || '—'}</dd></div>
          </dl>
        </article>
      </section>
      <section className="receivable-panel movements-panel">
        <div className="receivable-panel-heading"><div><span className="eyebrow">TRAZABILIDAD DE COBRANZA</span><h2>Cargos y abonos de la factura</h2></div>
          <span className="record-limit">{account?.movements.length} registros · con IVA</span></div>
        <p className="movement-ledger-note">El importe conserva el movimiento original. El saldo y el estado de cada cargo ya descuentan sus abonos.</p>
        <div className="movement-table-wrap"><table className="movement-table"><thead><tr><th>Movimiento</th><th>Fecha</th><th>Documento / referencia</th><th>Vencimiento</th><th>Tipo / estado</th><th>Importe / saldo con IVA</th></tr></thead>
          <tbody>{account?.movements.map(row => {
            const credit = row.signedAmount < 0;
            const paid = row.chargeStatus === 'Liquidada';
            const chargeStatus = row.chargeStatus === 'Liquidada' ? 'Liquidado' : row.chargeStatus === 'Cancelada' ? 'Cancelado' : row.chargeStatus;
            const chargeTone = row.chargeStatus === 'Liquidada' ? 'success' : row.chargeStatus === 'Cancelada' ? 'danger' : row.chargeStatus === 'Vencido' ? 'warning' : row.chargeStatus === 'Adeudo' ? 'info' : 'neutral';
            return <tr key={row.key}><td><span className={'movement-direction ' + (credit || paid ? 'credit' : 'charge')}>{paid ? <CheckCircle2 size={16} /> : credit ? <ArrowDownLeft size={16} /> : <ArrowUpRight size={16} />}</span>
              <div><strong>{row.conceptDescription || 'Concepto ' + row.conceptNumber}</strong><small>Cargo {row.chargeNumber} · {row.isOriginalCharge ? 'Original' : 'Aplicación'}</small></div></td>
              <td>{date(row.applicationDate)}</td><td>{row.document || row.reference}</td><td>{row.isOriginalCharge ? date(row.dueDate) : '—'}</td>
              <td>{row.isOriginalCharge && chargeStatus ? <><span className={'receivable-status ' + chargeTone}>{paid ? <CheckCircle2 size={14} /> : <Clock3 size={14} />}{chargeStatus}</span><small>Cargo original</small></> : <span className={'movement-type ' + (credit ? 'credit' : 'charge')}>{credit ? 'Abono / reducción' : 'Cargo'}</span>}</td>
              <td className={credit ? 'credit-amount' : ''}>{credit ? '−' : '+'}{money(Math.abs(row.signedAmount))}
                {row.isOriginalCharge && <small className={'movement-charge-balance ' + (paid ? 'credit-amount' : '')}>Saldo: {money(row.chargeBalance)}</small>}</td></tr>;
          })}</tbody></table>
          {account?.movements.length === 0 && <p className="table-empty">SAE no tiene cargos o aplicaciones vinculados a esta factura.</p>}
        </div>
      </section>
    </>}
  </div>;
}
