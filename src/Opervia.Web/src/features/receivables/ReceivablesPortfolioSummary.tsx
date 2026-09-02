import {
  AlertTriangle,
  Ban,
  Banknote,
  CalendarDays,
  CircleDollarSign,
  CreditCard,
  FileCheck2,
  Filter,
  Hash,
  LoaderCircle,
  ReceiptText,
  RefreshCw,
  RotateCcw,
  Scale,
  Store,
  UserRoundSearch,
  UsersRound,
  X,
} from 'lucide-react';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from 'react';

import { getReceivablesSummary } from '../../lib/saeApi';
import type {
  SaeConnectionRequest,
  SaeReceivableConceptTotal,
  SaeReceivablesSummaryFilters,
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
}

const moneyFormatter = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
  maximumFractionDigits: 2,
});

const shortDateFormatter = new Intl.DateTimeFormat('es-MX', {
  day: '2-digit',
  month: 'short',
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

function isAbortError(error: unknown): boolean {
  return (
    error instanceof DOMException &&
    error.name === 'AbortError'
  );
}

function BreakdownList({
  items,
  emptyMessage,
}: {
  items: SaeReceivableConceptTotal[];
  emptyMessage: string;
}) {
  const maximum = Math.max(
    ...items.map((item) => item.amount),
    1,
  );

  if (items.length === 0) {
    return <p className="portfolio-empty-list">{emptyMessage}</p>;
  }

  return (
    <div className="portfolio-breakdown-list">
      {items.map((item) => (
        <div
          className="portfolio-breakdown-row"
          key={`${item.classification}-${item.conceptNumber}`}
        >
          <div>
            <strong>{item.description}</strong>
            <small>
              Concepto {item.conceptNumber} · {item.movementCount}{' '}
              movimientos
            </small>
          </div>
          <b>{formatMoney(item.amount)}</b>
          <span>
            <i
              style={{
                width: `${Math.max(
                  3,
                  (item.amount / maximum) * 100,
                )}%`,
              }}
            />
          </span>
        </div>
      ))}
    </div>
  );
}

export function ReceivablesPortfolioSummary({
  connection,
  onRequestConnection,
  onSelectDocument,
  taxDisplayMode,
}: ReceivablesPortfolioSummaryProps) {
  const initialPeriod = useMemo(getCurrentPeriod, []);
  const requestRef = useRef<AbortController | null>(null);
  const [periodStart, setPeriodStart] =
    useState(initialPeriod.start);
  const [periodEnd, setPeriodEnd] =
    useState(initialPeriod.end);
  const [summary, setSummary] =
    useState<SaeReceivablesSummaryResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [draftFilters, setDraftFilters] =
    useState<SaeReceivablesSummaryFilters>({});
  const [appliedFilters, setAppliedFilters] =
    useState<SaeReceivablesSummaryFilters>({});

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
      appliedFilters,
      controller.signal,
    )
      .then((result) => {
        if (!result.isSuccessful) {
          throw new Error(result.message);
        }
        setSummary(result);
      })
      .catch((summaryError) => {
        if (!isAbortError(summaryError)) {
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
    appliedFilters,
    periodEnd,
    periodStart,
    refreshVersion,
  ]);

  const nonCashAmount =
    (summary?.returnsAndCreditsAmount ?? 0) +
    (summary?.appliedAdvanceAmount ?? 0) +
    (summary?.otherReductionAmount ?? 0);
  const collectionRatio =
    summary && summary.netInvoicedAmount > 0
      ? (summary.realIncomeAmount / summary.netInvoicedAmount) * 100
      : 0;
  const activeFilterCount = Object.values(appliedFilters)
    .filter(
      (value) =>
        value !== undefined &&
        value !== null &&
        value !== '',
    )
    .length;

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
  }

  function updateDraftFilter<
    TKey extends keyof SaeReceivablesSummaryFilters,
  >(
    key: TKey,
    value: SaeReceivablesSummaryFilters[TKey],
  ) {
    setDraftFilters((current) => ({
      ...current,
      [key]: value || undefined,
    }));
  }

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (
      draftFilters.folioFrom !== undefined &&
      draftFilters.folioTo !== undefined &&
      draftFilters.folioTo < draftFilters.folioFrom
    ) {
      setError(
        'El folio final debe ser igual o mayor al folio inicial.',
      );
      return;
    }

    setAppliedFilters({ ...draftFilters });
  }

  function clearFilters() {
    setDraftFilters({});
    setAppliedFilters({});
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
          <p>
            Ingresos por fecha de aplicación; cancelaciones por fecha
            efectiva de cancelación.
          </p>
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
            <span>Desde</span>
            <input
              type="date"
              value={periodStart}
              max={periodEnd}
              onChange={(event) => setPeriodStart(event.target.value)}
            />
          </label>
          <label>
            <span>Hasta</span>
            <input
              type="date"
              value={periodEnd}
              min={periodStart}
              onChange={(event) => setPeriodEnd(event.target.value)}
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
      </div>

      <form
        className="portfolio-filter-panel"
        onSubmit={applyFilters}
      >
        <div className="portfolio-filter-heading">
          <div>
            <Filter size={16} />
            <div>
              <strong>Filtros comerciales</strong>
              <small>
                Segmentan facturas, cancelaciones y pagos relacionados
              </small>
            </div>
          </div>
          {activeFilterCount > 0 && (
            <span>{activeFilterCount} activos</span>
          )}
        </div>

        <div className="portfolio-filter-grid">
          <label>
            <span><UsersRound size={13} /> Vendedor</span>
            <select
              value={draftFilters.sellerCode ?? ''}
              onChange={(event) =>
                updateDraftFilter(
                  'sellerCode',
                  event.target.value,
                )
              }
            >
              <option value="">Todos los vendedores</option>
              {summary?.filterOptions.sellers.map((option) => (
                <option value={option.value} key={option.value}>
                  {option.label} ({option.recordCount})
                </option>
              ))}
            </select>
          </label>

          <label>
            <span><ReceiptText size={13} /> Serie</span>
            <select
              value={draftFilters.series ?? ''}
              onChange={(event) =>
                updateDraftFilter('series', event.target.value)
              }
            >
              <option value="">Todas las series</option>
              {summary?.filterOptions.series.map((option) => (
                <option value={option.value} key={option.value}>
                  {option.label} ({option.recordCount})
                </option>
              ))}
            </select>
          </label>

          <label>
            <span><Hash size={13} /> Folio inicial</span>
            <input
              type="number"
              min="0"
              inputMode="numeric"
              value={draftFilters.folioFrom ?? ''}
              placeholder="Ej. 79000"
              onChange={(event) =>
                updateDraftFilter(
                  'folioFrom',
                  event.target.value
                    ? Number(event.target.value)
                    : undefined,
                )
              }
            />
          </label>

          <label>
            <span><Hash size={13} /> Folio final</span>
            <input
              type="number"
              min="0"
              inputMode="numeric"
              value={draftFilters.folioTo ?? ''}
              placeholder="Ej. 80057"
              onChange={(event) =>
                updateDraftFilter(
                  'folioTo',
                  event.target.value
                    ? Number(event.target.value)
                    : undefined,
                )
              }
            />
          </label>

          <label>
            <span><UserRoundSearch size={13} /> Cliente</span>
            <input
              type="search"
              value={draftFilters.customerCode ?? ''}
              placeholder="Clave exacta"
              onChange={(event) =>
                updateDraftFilter(
                  'customerCode',
                  event.target.value,
                )
              }
            />
          </label>

          <label>
            <span><Store size={13} /> Almacén</span>
            <select
              value={draftFilters.warehouseNumber ?? ''}
              onChange={(event) =>
                updateDraftFilter(
                  'warehouseNumber',
                  event.target.value
                    ? Number(event.target.value)
                    : undefined,
                )
              }
            >
              <option value="">Todos los almacenes</option>
              {summary?.filterOptions.warehouses.map((option) => (
                <option value={option.value} key={option.value}>
                  {option.label} ({option.recordCount})
                </option>
              ))}
            </select>
          </label>

          <label>
            <span><FileCheck2 size={13} /> Estado</span>
            <select
              value={draftFilters.invoiceStatus ?? ''}
              onChange={(event) =>
                updateDraftFilter(
                  'invoiceStatus',
                  event.target.value
                    ? (event.target.value as
                        | 'Active'
                        | 'Canceled')
                    : undefined,
                )
              }
            >
              <option value="">Todos los estados</option>
              <option value="Active">Vigentes</option>
              <option value="Canceled">Canceladas</option>
            </select>
          </label>

          <label>
            <span><CalendarDays size={13} /> Método fiscal</span>
            <select
              value={draftFilters.fiscalPaymentMethod ?? ''}
              onChange={(event) =>
                updateDraftFilter(
                  'fiscalPaymentMethod',
                  event.target.value,
                )
              }
            >
              <option value="">PUE y PPD</option>
              {summary?.filterOptions.fiscalPaymentMethods.map(
                (option) => (
                  <option value={option.value} key={option.value}>
                    {option.label} ({option.recordCount})
                  </option>
                ),
              )}
            </select>
          </label>

          <label>
            <span><CreditCard size={13} /> Forma de ingreso</span>
            <select
              value={draftFilters.paymentConceptNumber ?? ''}
              onChange={(event) =>
                updateDraftFilter(
                  'paymentConceptNumber',
                  event.target.value
                    ? Number(event.target.value)
                    : undefined,
                )
              }
            >
              <option value="">Todas las formas</option>
              {summary?.filterOptions.paymentConcepts.map(
                (option) => (
                  <option value={option.value} key={option.value}>
                    {option.label} ({option.recordCount})
                  </option>
                ),
              )}
            </select>
          </label>

          <div className="portfolio-filter-actions">
            <button type="submit" disabled={isLoading}>
              <Filter size={14} />
              Aplicar filtros
            </button>
            <button
              type="button"
              onClick={clearFilters}
              disabled={activeFilterCount === 0}
            >
              <X size={14} />
              Limpiar
            </button>
          </div>
        </div>

        {activeFilterCount > 0 && summary && (
          <div className="portfolio-filter-chips">
            {summary.appliedFilters.sellerCode && (
              <span>
                Vendedor:{' '}
                {summary.filterOptions.sellers.find(
                  (option) =>
                    option.value ===
                    summary.appliedFilters.sellerCode,
                )?.label ?? summary.appliedFilters.sellerCode}
              </span>
            )}
            {summary.appliedFilters.series && (
              <span>Serie: {summary.appliedFilters.series}</span>
            )}
            {summary.appliedFilters.folioFrom !== undefined && (
              <span>
                Desde folio {summary.appliedFilters.folioFrom}
              </span>
            )}
            {summary.appliedFilters.folioTo !== undefined && (
              <span>
                Hasta folio {summary.appliedFilters.folioTo}
              </span>
            )}
            {summary.appliedFilters.customerCode && (
              <span>
                Cliente: {summary.appliedFilters.customerCode}
              </span>
            )}
            {summary.appliedFilters.warehouseNumber !== undefined && (
              <span>
                Almacén {summary.appliedFilters.warehouseNumber}
              </span>
            )}
            {summary.appliedFilters.invoiceStatus && (
              <span>
                {summary.appliedFilters.invoiceStatus === 'Active'
                  ? 'Sólo vigentes'
                  : 'Sólo canceladas'}
              </span>
            )}
            {summary.appliedFilters.fiscalPaymentMethod && (
              <span>
                Método fiscal:{' '}
                {summary.appliedFilters.fiscalPaymentMethod}
              </span>
            )}
            {summary.appliedFilters.paymentConceptNumber !==
              undefined && (
              <span>
                Ingreso:{' '}
                {summary.filterOptions.paymentConcepts.find(
                  (option) =>
                    Number(option.value) ===
                    summary.appliedFilters.paymentConceptNumber,
                )?.label ??
                  `Concepto ${summary.appliedFilters.paymentConceptNumber}`}
              </span>
            )}
          </div>
        )}

        {activeFilterCount > 0 && (
          <p className="portfolio-filter-scope-note">
            Los filtros comerciales se aplican a pagos que SAE vincula
            mediante su número de factura. Los movimientos sin factura
            relacionada permanecen únicamente en la vista sin filtros.
          </p>
        )}
      </form>

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
            <article>
              <span className="portfolio-kpi-icon ratio">
                <Scale size={20} />
              </span>
              <small>Cobrado vs. facturado</small>
              <strong>{collectionRatio.toFixed(1)}%</strong>
              <p>Comparación de flujos del periodo</p>
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

          <div className="portfolio-detail-grid">
            <article className="portfolio-panel">
              <div className="portfolio-panel-heading">
                <div>
                  <RotateCcw size={18} />
                  <div>
                    <strong>Reducciones no monetarias</strong>
                    <small>
                      Disminuyen cartera, pero no son ingreso nuevo
                    </small>
                  </div>
                </div>
              </div>
              <div className="portfolio-noncash-totals">
                <span>
                  Devoluciones y créditos
                  <b>{formatMoney(summary.returnsAndCreditsAmount)}</b>
                </span>
                <span>
                  Anticipos aplicados
                  <b>{formatMoney(summary.appliedAdvanceAmount)}</b>
                </span>
                <span>
                  Otras reducciones
                  <b>{formatMoney(summary.otherReductionAmount)}</b>
                </span>
              </div>
              <BreakdownList
                items={summary.nonCashBreakdown}
                emptyMessage="No hay reducciones no monetarias en este periodo."
              />
            </article>

            <article className="portfolio-panel">
              <div className="portfolio-panel-heading">
                <div>
                  <Ban size={18} />
                  <div>
                    <strong>Cancelaciones recientes</strong>
                    <small>Por fecha efectiva de cancelación</small>
                  </div>
                </div>
              </div>
              <div className="portfolio-activity-list cancellations">
                {summary.recentCancellations.map((item) => (
                  <button
                    type="button"
                    key={`${item.invoiceNumber}-${item.cancellationDate}`}
                    onClick={() => onSelectDocument(item.invoiceNumber)}
                  >
                    <span><Ban size={15} /></span>
                    <div>
                      <strong>{item.invoiceNumber}</strong>
                      <small>
                        Cliente {item.customerCode} · Cancelada{' '}
                        {formatShortDate(item.cancellationDate)}
                      </small>
                    </div>
                    <b>{formatMoney(item.amount)}</b>
                  </button>
                ))}
                {summary.recentCancellations.length === 0 && (
                  <p className="portfolio-empty-list">
                    No hubo cancelaciones en este periodo.
                  </p>
                )}
              </div>
            </article>

            <article className="portfolio-panel">
              <div className="portfolio-panel-heading">
                <div>
                  <Banknote size={18} />
                  <div>
                    <strong>Pagos recientes</strong>
                    <small>Ingresos monetarios confirmados</small>
                  </div>
                </div>
              </div>
              <div className="portfolio-activity-list payments">
                {summary.recentPayments.map((item) => {
                  const documentNumber =
                    item.invoiceNumber ?? item.document ?? '';
                  return (
                    <button
                      type="button"
                      key={`${item.customerCode}-${item.applicationDate}-${item.amount}`}
                      onClick={() =>
                        documentNumber &&
                        onSelectDocument(documentNumber)
                      }
                      disabled={!documentNumber}
                    >
                      <span><Banknote size={15} /></span>
                      <div>
                        <strong>{documentNumber || 'Sin factura'}</strong>
                        <small>
                          {item.description} ·{' '}
                          {formatShortDate(item.applicationDate)}
                        </small>
                      </div>
                      <b>{formatMoney(item.amount)}</b>
                    </button>
                  );
                })}
                {summary.recentPayments.length === 0 && (
                  <p className="portfolio-empty-list">
                    No hubo pagos monetarios en este periodo.
                  </p>
                )}
              </div>
            </article>
          </div>

          <div className="portfolio-method-note">
            <ReceiptText size={16} />
            <p>
              <strong>Cómo se calcula:</strong> facturación vigente usa
              facturas no canceladas por fecha de emisión; ingresos reales
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
          </div>
        </>
      )}
    </section>
  );
}
