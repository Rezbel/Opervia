import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  CircleAlert,
  Clock3,
  Filter,
  GitBranch,
  RefreshCw,
  TimerReset,
  TrendingDown,
} from 'lucide-react';
import { getSalesFlowSummary } from '../../lib/saeApi';
import type {
  SaeConnectionRequest,
  SaeSalesFlowSummaryResult,
  TaxDisplayMode,
} from '../../types/sae';
import './SalesFlowsDashboard.css';

interface SalesFlowsDashboardProps {
  connection: SaeConnectionRequest | null;
  connectionName: string;
  taxDisplayMode: TaxDisplayMode;
  onRequestConnection: () => void;
}

function dateInputValue(date: Date): string {
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 10);
}

function defaultPeriod(): { from: string; to: string } {
  const to = new Date();
  const from = new Date(to);
  from.setDate(from.getDate() - 89);
  return { from: dateInputValue(from), to: dateInputValue(to) };
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('es-MX', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value));
}

export function SalesFlowsDashboard({
  connection,
  connectionName,
  taxDisplayMode,
  onRequestConnection,
}: SalesFlowsDashboardProps) {
  const initialPeriod = useMemo(defaultPeriod, []);
  const requestRef = useRef<AbortController | null>(null);
  const [from, setFrom] = useState(initialPeriod.from);
  const [to, setTo] = useState(initialPeriod.to);
  const [seller, setSeller] = useState('');
  const [result, setResult] = useState<SaeSalesFlowSummaryResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const load = useCallback(async () => {
    if (!connection) return;
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setIsLoading(true);
    setError(null);
    try {
      setResult(await getSalesFlowSummary(connection, from, to, seller, controller.signal));
    } catch (requestError) {
      if ((requestError as Error).name !== 'AbortError') {
        setError(requestError instanceof Error
          ? requestError.message
          : 'No fue posible analizar los flujos de venta.');
      }
    } finally {
      if (requestRef.current === controller) {
        requestRef.current = null;
        setIsLoading(false);
      }
    }
  }, [connection, from, seller, to]);

  useEffect(() => {
    void load();
    return () => requestRef.current?.abort();
  }, [load]);

  const analysis = useMemo(() => {
    if (!result) return null;
    const lowestTransition = [...result.transitions]
      .filter((item) => item.consideredCount > 0)
      .sort((a, b) => a.conversionRatePercent - b.conversionRatePercent)[0] ?? null;
    const slowestTransition = [...result.transitions]
      .filter((item) => item.averageDays !== null)
      .sort((a, b) => (b.averageDays ?? 0) - (a.averageDays ?? 0))[0] ?? null;
    const totalCycleDays = result.transitions.reduce(
      (sum, item) => sum + (item.averageDays ?? 0), 0);
    const totalDocuments = result.stages.reduce((sum, item) => sum + item.documentCount, 0);
    const totalCancelled = result.stages.reduce((sum, item) => sum + item.cancelledCount, 0);
    const cancellationRate = totalDocuments === 0 ? 0 : totalCancelled * 100 / totalDocuments;
    return {
      lowestTransition,
      slowestTransition,
      totalCycleDays,
      totalDocuments,
      totalCancelled,
      cancellationRate,
    };
  }, [result]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void load();
  }

  function applyPeriod(days: number) {
    const periodTo = new Date();
    const periodFrom = new Date(periodTo);
    periodFrom.setDate(periodFrom.getDate() - (days - 1));
    setFrom(dateInputValue(periodFrom));
    setTo(dateInputValue(periodTo));
  }

  if (!connection) {
    return (
      <section className="sales-flow-empty">
        <GitBranch size={30} />
        <h1>Flujos de venta</h1>
        <p>Conecta una empresa SAE para detectar conversiones, tiempos y documentos detenidos.</p>
        <button type="button" onClick={onRequestConnection}>Configurar conexión SAE</button>
      </section>
    );
  }

  return (
    <div className="sales-flows-page">
      <header className="sales-flows-header">
        <div>
          <span className="eyebrow">INTELIGENCIA DEL PROCESO</span>
          <h1>Flujos de venta</h1>
          <p>Detecta dónde avanza, se demora o se rompe la operación; sin repetir el reporte de facturación.</p>
        </div>
        <div className="sales-flow-source">
          <span />
          <div><small>Fuente de datos</small><strong>{connectionName}</strong></div>
          <CheckCircle2 size={18} />
        </div>
      </header>

      <form className="sales-flow-filters" onSubmit={handleSubmit}>
        <div className="period-presets" aria-label="Periodos rápidos">
          {[30, 90, 180].map((days) => (
            <button key={days} type="button" onClick={() => applyPeriod(days)}>
              {days} días
            </button>
          ))}
        </div>
        <label>Desde<input type="date" value={from} max={to} onChange={(event) => setFrom(event.target.value)} /></label>
        <label>Hasta<input type="date" value={to} min={from} onChange={(event) => setTo(event.target.value)} /></label>
        <label>Vendedor
          <select value={seller} onChange={(event) => setSeller(event.target.value)}>
            <option value="">Todos</option>
            {result?.sellerOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label} · {option.documentCount}
              </option>
            ))}
          </select>
        </label>
        <button className="sales-flow-apply" type="submit" disabled={isLoading}>
          {isLoading ? <RefreshCw className="spin" size={17} /> : <Filter size={17} />}
          {isLoading ? 'Analizando' : 'Aplicar'}
        </button>
      </form>

      {error && <div className="sales-flow-error"><CircleAlert size={18} />{error}</div>}

      {result && analysis && (
        <>
          <section className="flow-health-grid">
            <article>
              <GitBranch size={21} />
              <div><span>Conversión más baja</span><strong>{analysis.lowestTransition?.conversionRatePercent.toFixed(1) ?? '—'}%</strong><small>{analysis.lowestTransition?.label ?? 'Sin datos suficientes'}</small></div>
            </article>
            <article>
              <TimerReset size={21} />
              <div><span>Recorrido estimado</span><strong>{analysis.totalCycleDays.toFixed(1)} días</strong><small>Suma de tiempos promedio entre etapas</small></div>
            </article>
            <article className={result.bottlenecks.length > 0 ? 'warning' : ''}>
              <Clock3 size={21} />
              <div><span>Documentos detenidos</span><strong>{result.bottlenecks.length}</strong><small>Más de 7 días sin siguiente documento</small></div>
            </article>
            <article className={result.brokenLinkCount > 0 ? 'danger' : ''}>
              <AlertTriangle size={21} />
              <div><span>Vínculos por revisar</span><strong>{result.brokenLinkCount}</strong><small>{result.skippedStageCount} saltos de etapa detectados</small></div>
            </article>
          </section>

          <section className="flow-funnel-panel">
            <div className="flow-section-heading">
              <div><span className="eyebrow">EMBUDO DOCUMENTAL</span><h2>Avance entre etapas</h2></div>
              <small>{analysis.totalDocuments.toLocaleString('es-MX')} documentos · {analysis.cancellationRate.toFixed(1)}% cancelados</small>
            </div>
            <div className="flow-funnel">
              {result.stages.map((stage, index) => {
                const transition = result.transitions[index];
                const stageAmount = taxDisplayMode === 'withTax'
                  ? stage.activeAmountWithTax
                  : stage.activeAmountBeforeTax;
                return (
                  <div className="flow-funnel-segment" key={stage.kind}>
                    <article>
                      <span>{stage.label}</span>
                      <strong>{stage.activeCount.toLocaleString('es-MX')}</strong>
                      <small>{stage.cancelledCount} cancelados</small>
                      <b>{formatCurrency(stageAmount)} <em>{taxDisplayMode === 'withTax' ? 'con IVA' : 'sin IVA'}</em></b>
                    </article>
                    {transition && (
                      <div className="flow-transition">
                        <ArrowRight size={19} />
                        <strong>{transition.conversionRatePercent.toFixed(1)}%</strong>
                        <small>{transition.averageDays === null ? 'Sin tiempo' : `${transition.averageDays.toFixed(1)} días`}</small>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <p className="flow-method-note">
              La conversión incluye en tiempo real todos los documentos vigentes del periodo,
              incluso los creados hoy. {result.recentQuotationWithoutOrderCount.toLocaleString('es-MX')}{' '}
              cotizaciones tienen menos de 7 días y aún no generan pedido; ya están incluidas
              en el porcentaje. Una venta que omita una etapa aparece como salto y no se fuerza
              artificialmente dentro del embudo.
            </p>
          </section>

          <section className="flow-analysis-grid">
            <article className="flow-bottlenecks-panel">
              <div className="flow-section-heading">
                <div><span className="eyebrow">COLA DE ATENCIÓN</span><h2>Documentos que no avanzaron</h2></div>
                <span className="flow-record-count">{result.bottlenecks.length} prioritarios</span>
              </div>
              {result.bottlenecks.length === 0 ? (
                <div className="flow-no-bottlenecks"><CheckCircle2 size={22} />No hay documentos detenidos en el periodo.</div>
              ) : (
                <div className="flow-bottleneck-table">
                  <div className="flow-table-head"><span>Documento</span><span>Cliente / vendedor</span><span>Espera</span><span>Importe</span></div>
                  {result.bottlenecks.map((item) => (
                    <div className="flow-table-row" key={`${item.kind}:${item.documentNumber}`}>
                      <div><strong>{item.documentNumber}</strong><small>{item.stageLabel} → {item.expectedNextStage}</small></div>
                      <div><strong>Cliente {item.customerCode}</strong><small>{item.sellerCode || 'Sin vendedor'} · {formatDate(item.documentDate)}</small></div>
                      <span className={item.waitingDays >= 30 ? 'critical-wait' : ''}>{item.waitingDays} días</span>
                      <b>{formatCurrency(taxDisplayMode === 'withTax' ? item.amountWithTax : item.amountBeforeTax)}</b>
                    </div>
                  ))}
                </div>
              )}
            </article>

            <aside className="flow-diagnosis-panel">
              <div className="flow-section-heading"><div><span className="eyebrow">LECTURA OPERATIVA</span><h2>Qué atender primero</h2></div></div>
              {analysis.lowestTransition && (
                <div className="diagnosis-item amber"><TrendingDown size={19} /><div><strong>Conversión más débil</strong><p>{analysis.lowestTransition.label}: {analysis.lowestTransition.progressedCount} de {analysis.lowestTransition.consideredCount} documentos vigentes avanzaron.</p></div></div>
              )}
              {analysis.slowestTransition && (
                <div className="diagnosis-item blue"><Clock3 size={19} /><div><strong>Etapa más lenta</strong><p>{analysis.slowestTransition.label} tarda en promedio {analysis.slowestTransition.averageDays?.toFixed(1)} días.</p></div></div>
              )}
              <div className={`diagnosis-item ${result.brokenLinkCount > 0 ? 'red' : 'green'}`}>
                {result.brokenLinkCount > 0 ? <AlertTriangle size={19} /> : <CheckCircle2 size={19} />}
                <div><strong>Integridad de referencias</strong><p>{result.brokenLinkCount > 0 ? `${result.brokenLinkCount} documentos apuntan a un antecedente que no fue localizado.` : 'No se localizaron referencias rotas en las etapas normales.'}</p></div>
              </div>
              <small className="flow-readonly-note">SAE en vivo · solo lectura · consulta terminada en {result.elapsedMilliseconds} ms</small>
            </aside>
          </section>
        </>
      )}
    </div>
  );
}
