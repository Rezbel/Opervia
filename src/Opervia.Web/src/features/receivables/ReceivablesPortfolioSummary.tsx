import {
  AlertTriangle,
  Ban,
  Banknote,
  CalendarDays,
  CircleDollarSign,
  FileCheck2,
  LoaderCircle,
  ReceiptText,
  RefreshCw,
  RotateCcw,
  Search,
  X,
} from 'lucide-react';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { getReceivableInvoices, getReceivablesSummary } from '../../lib/saeApi';
import type {
  SaeConnectionRequest,
  SaeReceivableInvoiceListingResult,
  SaeReceivablesSummaryResult,
  TaxDisplayMode,
} from '../../types/sae';
import { ReceivablesChartStudio } from './ReceivablesChartStudio';

import './ReceivablesPortfolioSummary.css';

interface ReceivablesPortfolioSummaryProps {
  connection: SaeConnectionRequest | null;
  onRequestConnection: () => void;
  onSelectDocument: (documentNumber: string) => void;
  taxDisplayMode: TaxDisplayMode;
  onTaxDisplayModeChange: (mode: TaxDisplayMode) => void;
}

const invoicePageSizeOptions = [10, 30, 60, 100] as const;

const moneyFormatter = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
  maximumFractionDigits: 2,
});

const shortDateFormatter = new Intl.DateTimeFormat('es-MX', {
  day: '2-digit',
  month: 'short',
});

const invoiceDueDateFormatter = new Intl.DateTimeFormat('es-MX', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});

function toLocalIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getCurrentPeriod() {
  const today = new Date();
  return {
    start: toLocalIsoDate(
      new Date(today.getFullYear(), today.getMonth(), 1),
    ),
    end: toLocalIsoDate(today),
  };
}

function formatMoney(value: number): string {
  return moneyFormatter.format(value);
}

function formatShortDate(value: string): string {
  const date = new Date(`${value.slice(0, 10)}T12:00:00`);
  return Number.isNaN(date.getTime())
    ? value
    : shortDateFormatter.format(date);
}

function formatInvoiceDueDate(value: string): string {
  const date = new Date(`${value.slice(0, 10)}T12:00:00`);
  return Number.isNaN(date.getTime())
    ? value
    : invoiceDueDateFormatter.format(date);
}

function isAbortError(error: unknown): boolean {
  return (
    error instanceof DOMException &&
    error.name === 'AbortError'
  );
}

export function ReceivablesPortfolioSummary({
  connection,
  onRequestConnection,
  onSelectDocument,
  taxDisplayMode,
  onTaxDisplayModeChange,
}: ReceivablesPortfolioSummaryProps) {
  const initialPeriod = useMemo(getCurrentPeriod, []);
  const requestRef = useRef<AbortController | null>(null);
  const invoiceRequestRef = useRef<AbortController | null>(null);
  const [periodStart, setPeriodStart] =
    useState(initialPeriod.start);
  const [periodEnd, setPeriodEnd] =
    useState(initialPeriod.end);
  const [summary, setSummary] =
    useState<SaeReceivablesSummaryResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [invoicePage, setInvoicePage] = useState(1);
  const [invoicePageSize, setInvoicePageSize] = useState(10);
  const [selectedInvoiceNumber, setSelectedInvoiceNumber] = useState('');
  const [invoiceSearch, setInvoiceSearch] = useState('');
  const [appliedInvoiceSearch, setAppliedInvoiceSearch] = useState('');
  const [invoiceListing, setInvoiceListing] = useState<SaeReceivableInvoiceListingResult | null>(null);
  const [invoicesLoading, setInvoicesLoading] = useState(false);
  const [invoiceError, setInvoiceError] = useState<string | null>(null);
  const searchPending = invoiceSearch.trim() !== appliedInvoiceSearch;
  const invoiceBusy = searchPending || invoicesLoading;
  const currentInvoicePage = invoiceListing?.invoicePage ?? invoicePage;

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setAppliedInvoiceSearch(invoiceSearch.trim());
      setInvoicePage(1);
    }, 200);
    return () => window.clearTimeout(timer);
  }, [invoiceSearch]);

  useEffect(() => {
    if (!connection || !periodStart || !periodEnd) {
      return;
    }

    const controller = new AbortController();
    requestRef.current?.abort();
    requestRef.current = controller;
    setIsLoading(true);
    setError(null);

    void getReceivablesSummary(
      connection,
      periodStart,
      periodEnd,
      {},
      controller.signal,
      1,
      10,
      false,
    )
      .then((result) => {
        if (controller.signal.aborted) return;
        if (!result.isSuccessful) {
          throw new Error(result.message);
        }
        setSummary(result);
      })
      .catch((summaryError) => {
        if (!controller.signal.aborted && !isAbortError(summaryError)) {
          setError(
            summaryError instanceof Error
              ? summaryError.message
              : 'No fue posible cargar el resumen financiero.',
          );
        }
      })
      .finally(() => {
        if (requestRef.current === controller) {
          requestRef.current = null;
          setIsLoading(false);
        }
      });

    return () => controller.abort();
  }, [
    connection,
    periodEnd,
    periodStart,
    refreshVersion,
  ]);

  useEffect(() => {
    if (!connection || !periodStart || !periodEnd) { setInvoiceListing(null); return; }
    const controller = new AbortController();
    invoiceRequestRef.current?.abort();
    invoiceRequestRef.current = controller;
    setInvoiceListing(null);
    setInvoicesLoading(true);
    setInvoiceError(null);
    void getReceivableInvoices(connection, periodStart, periodEnd, appliedInvoiceSearch, invoicePage, invoicePageSize, controller.signal)
      .then(result => {
        if (controller.signal.aborted) return;
        if (!result.isSuccessful) throw new Error(result.message);
        setInvoiceListing(result);
      })
      .catch(value => { if (!controller.signal.aborted) setInvoiceError(value instanceof Error ? value.message : 'No fue posible buscar las facturas.'); })
      .finally(() => { if (invoiceRequestRef.current === controller) { invoiceRequestRef.current = null; setInvoicesLoading(false); } });
    return () => controller.abort();
  }, [connection, periodStart, periodEnd, appliedInvoiceSearch, invoicePage, invoicePageSize, refreshVersion]);

  const nonCashAmount =
    (summary?.returnsAndCreditsAmount ?? 0) +
    (summary?.appliedAdvanceAmount ?? 0) +
    (summary?.otherReductionAmount ?? 0);

  function selectPreset(
    preset: 'month' | '30days' | 'year',
  ) {
    const today = new Date();
    let start: Date;

    if (preset === 'year') {
      start = new Date(today.getFullYear(), 0, 1);
    } else if (preset === '30days') {
      start = new Date(today);
      start.setDate(start.getDate() - 29);
    } else {
      start = new Date(
        today.getFullYear(),
        today.getMonth(),
        1,
      );
    }

    setPeriodStart(toLocalIsoDate(start));
    setPeriodEnd(toLocalIsoDate(today));
    setInvoicePage(1);
  }

  if (!connection) {
    return (
      <section className="portfolio-summary portfolio-connect-state">
        <div>
          <CircleDollarSign size={28} />
          <div>
            <span className="eyebrow">RESUMEN FINANCIERO</span>
            <h2>Conecta SAE para calcular los indicadores</h2>
            <p>
              La lectura separará facturación, ingresos reales,
              devoluciones y cancelaciones.
            </p>
          </div>
        </div>
        <button type="button" onClick={onRequestConnection}>
          Configurar conexión
        </button>
      </section>
    );
  }

  return (
    <section className="portfolio-summary">
      <div className="portfolio-toolbar">
        <div>
          <span className="eyebrow">PANORAMA DEL PERIODO</span>
          <h2>Facturación y cobranza real</h2>
        </div>

        <div className="portfolio-period-controls">
          <div className="portfolio-presets">
            <button type="button" onClick={() => selectPreset('month')}>
              Este mes
            </button>
            <button type="button" onClick={() => selectPreset('30days')}>
              30 días
            </button>
            <button type="button" onClick={() => selectPreset('year')}>
              Este año
            </button>
          </div>
          <label>
            <span>Desde (elaboración)</span>
            <input
              type="date"
              value={periodStart}
              max={periodEnd}
              onChange={(event) => {
                setPeriodStart(event.target.value);
                setInvoicePage(1);
              }}
            />
          </label>
          <label>
            <span>Hasta (elaboración)</span>
            <input
              type="date"
              value={periodEnd}
              min={periodStart}
              onChange={(event) => {
                setPeriodEnd(event.target.value);
                setInvoicePage(1);
              }}
            />
          </label>
          <button
            type="button"
            className="portfolio-refresh"
            aria-label="Actualizar resumen"
            onClick={() => setRefreshVersion((value) => value + 1)}
            disabled={isLoading}
          >
            {isLoading ? (
              <LoaderCircle className="spin" size={17} />
            ) : (
              <RefreshCw size={17} />
            )}
          </button>
        </div>

        <div className="receivables-tax-filter" role="group" aria-label="Mostrar importes">
          <span>Importes</span>
          <button
            type="button"
            className={taxDisplayMode === 'withoutTax' ? 'active' : ''}
            onClick={() => onTaxDisplayModeChange('withoutTax')}
          >
            Sin IVA
          </button>
          <button
            type="button"
            className={taxDisplayMode === 'withTax' ? 'active' : ''}
            onClick={() => onTaxDisplayModeChange('withTax')}
          >
            Con IVA
          </button>
        </div>
      </div>

      {error && (
        <div className="portfolio-error">
          <AlertTriangle size={17} />
          {error}
        </div>
      )}

      {!summary && isLoading && (
        <div className="portfolio-loading">
          <LoaderCircle className="spin" size={25} />
          Calculando indicadores financieros…
        </div>
      )}

      {summary && (
        <>
          {summary.futureDatedReductionCount > 0 && (
            <div className="portfolio-anomaly">
              <AlertTriangle size={17} />
              <div>
                <strong>
                  {summary.futureDatedReductionCount} movimientos
                  reductores tienen fecha futura
                </strong>
                <span>
                  No se incluyen como ingresos del periodo hasta que su
                  fecha sea vigente.
                </span>
              </div>
            </div>
          )}

          <div className="portfolio-kpis">
            <article>
              <span className="portfolio-kpi-icon billed">
                <FileCheck2 size={20} />
              </span>
              <small>Facturación vigente</small>
              <strong>{formatMoney(taxDisplayMode === 'withTax' ? summary.netInvoicedAmount : summary.netInvoicedAmountWithoutTax)}</strong>
              <p>{summary.netInvoiceCount} facturas no canceladas</p>
            </article>
            <article>
              <span className="portfolio-kpi-icon income">
                <Banknote size={20} />
              </span>
              <small>Ingresos reales</small>
              <strong>{formatMoney(summary.realIncomeAmount)}</strong>
              <p>{summary.realPaymentCount} pagos recibidos</p>
            </article>
            <article>
              <span className="portfolio-kpi-icon canceled">
                <Ban size={20} />
              </span>
              <small>Cancelaciones reales</small>
              <strong>
                {formatMoney(taxDisplayMode === 'withTax' ? summary.canceledInPeriodAmount : summary.canceledInPeriodAmountWithoutTax)}
              </strong>
              <p>{summary.canceledInPeriodCount} canceladas en el periodo</p>
            </article>
            <article>
              <span className="portfolio-kpi-icon adjusted">
                <RotateCcw size={20} />
              </span>
              <small>Reducciones sin ingreso</small>
              <strong>{formatMoney(nonCashAmount)}</strong>
              <p>Devoluciones, créditos y anticipos</p>
            </article>
          </div>

          <div className="portfolio-reconciliation">
            <div>
              <small>Facturación registrada</small>
              <strong>
                {formatMoney(taxDisplayMode === 'withTax' ? summary.grossInvoicedAmount : summary.grossInvoicedAmountWithoutTax)}
              </strong>
              <span>{summary.invoiceCount} documentos generados</span>
            </div>
            <i>−</i>
            <div className="negative">
              <small>Documentos del lote cancelados</small>
              <strong>{formatMoney(taxDisplayMode === 'withTax' ? summary.voidedInvoiceAmount : summary.voidedInvoiceAmountWithoutTax)}</strong>
              <span>{summary.voidedInvoiceCount} documentos</span>
            </div>
            <i>=</i>
            <div className="positive">
              <small>Total facturado vigente</small>
              <strong>{formatMoney(taxDisplayMode === 'withTax' ? summary.netInvoicedAmount : summary.netInvoicedAmountWithoutTax)}</strong>
              <span>Estado actual de las facturas del periodo</span>
            </div>
          </div>

          <ReceivablesChartStudio summary={summary} taxDisplayMode={taxDisplayMode} />
        </>
      )}

          <section className="portfolio-panel portfolio-invoices">
            <div className="portfolio-panel-heading">
              <div>
                <FileCheck2 size={18} />
                <div>
                  <strong>Facturas del periodo</strong>
                  <small>Selecciona una factura para abrir su expediente de cobranza</small>
                </div>
              </div>
              <div className="portfolio-invoice-tools">
                <label className="portfolio-invoice-search">
                  {invoiceBusy ? <LoaderCircle className="spin" size={16} /> : <Search size={16} />}
                  <input
                    value={invoiceSearch}
                    onChange={(event) => setInvoiceSearch(event.target.value)}
                    maxLength={120}
                    spellCheck={false}
                    onKeyDown={event => {
                      if (event.key === 'Enter') { setAppliedInvoiceSearch(invoiceSearch.trim()); setInvoicePage(1); }
                      if (event.key === 'Escape') { setInvoiceSearch(''); setAppliedInvoiceSearch(''); setInvoicePage(1); }
                    }}
                    placeholder="Buscar factura, clave o cliente"
                    aria-label="Buscar por factura, clave o nombre del cliente"
                  />
                  {invoiceSearch && <button type="button" aria-label="Limpiar búsqueda de facturas" onClick={() => { setInvoiceSearch(''); setAppliedInvoiceSearch(''); setInvoicePage(1); }}><X size={15} /></button>}
                </label>
                <span className="record-limit" role="status" aria-live="polite">{invoiceBusy ? 'Buscando…' : invoiceListing ? `${invoiceListing.totalInvoiceCount.toLocaleString('es-MX')} ${appliedInvoiceSearch ? invoiceListing.totalInvoiceCount === 1 ? 'coincidencia' : 'coincidencias' : invoiceListing.totalInvoiceCount === 1 ? 'factura' : 'facturas'}` : '—'}</span>
              </div>
            </div>
            <p className="portfolio-invoice-search-help">Periodo por fecha de elaboración. Busca por factura, clave o palabras del nombre del cliente.</p>
            {invoiceError && <div className="portfolio-error" role="alert"><AlertTriangle size={17} />{invoiceError}</div>}
            <div className="portfolio-invoice-table-wrap">
              <div className="portfolio-invoice-table-head" aria-hidden="true">
                <span>Factura</span>
                <span>Cliente</span>
                <span>Vendedor (clave)</span>
                <span>Elaboración</span>
                <span>Vencimiento</span>
                <span>Estado</span>
              </div>
              <div className="portfolio-invoice-table" aria-busy={invoiceBusy}>
                {invoiceBusy && <div className="portfolio-loading portfolio-invoice-loading"><LoaderCircle className="spin" size={22} />Buscando facturas del periodo…</div>}
                {!invoiceBusy && invoiceListing?.invoices.map((invoice) => {
                  const statusTone = invoice.status === 'Liquidada'
                    ? 'paid'
                    : invoice.status === 'Cancelada'
                      ? 'cancelled'
                      : invoice.status === 'Vencido'
                        ? 'overdue'
                        : 'due';
                  const selected = selectedInvoiceNumber === invoice.invoiceNumber;
                  return (
                    <button
                      type="button"
                      key={invoice.invoiceNumber}
                      className={`portfolio-invoice-row ${statusTone}${selected ? ' selected' : ''}`}
                      aria-pressed={selected}
                      onClick={() => {
                        setSelectedInvoiceNumber(invoice.invoiceNumber);
                        onSelectDocument(invoice.invoiceNumber);
                      }}
                    >
                      <strong>{invoice.invoiceNumber}</strong>
                      <span className="portfolio-invoice-customer">
                        <strong>{invoice.customerName}</strong>
                        <small>{invoice.customerCode}</small>
                      </span>
                      <span>{invoice.sellerCode || '—'}</span>
                      <span>{invoice.creationDate ? formatInvoiceDueDate(invoice.creationDate) : 'Sin fecha'}</span>
                      <span>{invoice.dueDate ? formatInvoiceDueDate(invoice.dueDate) : 'Sin fecha'}</span>
                      <span className={`portfolio-invoice-status ${statusTone}`}>{invoice.status}</span>
                    </button>
                  );
                })}
                {!invoiceBusy && !invoiceError && invoiceListing?.invoices.length === 0 && (
                  <p className="portfolio-empty-list">
                    {appliedInvoiceSearch
                      ? 'No se encontraron facturas con ese criterio.'
                      : 'No hay facturas emitidas en el periodo seleccionado.'}
                  </p>
                )}
              </div>
            </div>
            <div className="portfolio-invoice-pagination">
              <span>
                {invoiceBusy ? 'Buscando…' : `Página ${currentInvoicePage} de ${Math.max(1, Math.ceil((invoiceListing?.totalInvoiceCount ?? 0) / invoicePageSize))}`}
              </span>
              <div className="portfolio-invoice-page-actions">
                <label className="portfolio-invoice-page-size">
                  <span>Mostrar</span>
                  <select
                    value={invoicePageSize}
                    disabled={invoiceBusy}
                    onChange={(event) => {
                      setInvoicePageSize(Number(event.target.value));
                      setInvoicePage(1);
                    }}
                    aria-label="Facturas por página"
                  >
                    {invoicePageSizeOptions.map((size) => (
                      <option key={size} value={size}>{size}</option>
                    ))}
                  </select>
                  <span>por página</span>
                </label>
                <button
                  type="button"
                  disabled={currentInvoicePage <= 1 || invoiceBusy || !invoiceListing}
                  onClick={() => setInvoicePage(Math.max(1, currentInvoicePage - 1))}
                >Anterior</button>
                <button
                  type="button"
                  disabled={currentInvoicePage * invoicePageSize >= (invoiceListing?.totalInvoiceCount ?? 0) || invoiceBusy || !invoiceListing}
                  onClick={() => setInvoicePage(currentInvoicePage + 1)}
                >Siguiente</button>
              </div>
            </div>
          </section>

          {summary && <div className="portfolio-method-note">
            <ReceiptText size={16} />
            <p>
              <strong>Cómo se calcula:</strong> facturación vigente usa
              facturas no canceladas por fecha de elaboración; ingresos reales
              usa efectivo, cheques confirmados, transferencias, TDC, TDD,
              CoDi y anticipos recibidos por fecha de aplicación.
              Devoluciones, notas de crédito y anticipos aplicados se
              presentan aparte.
            </p>
            <span>
              <CalendarDays size={14} />
              {formatShortDate(summary.periodStart)} –{' '}
              {formatShortDate(summary.periodEnd)}
            </span>
          </div>}
    </section>
  );
}
