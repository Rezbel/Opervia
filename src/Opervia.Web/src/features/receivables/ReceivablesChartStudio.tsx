import {
  ChartNoAxesColumn,
  ChartPie,
  Rows3,
  SlidersHorizontal,
  Sparkles,
} from 'lucide-react';
import { useMemo, useState } from 'react';

import type {
  SaeReceivableFilterOption,
  SaeReceivablesSummaryResult,
  TaxDisplayMode,
} from '../../types/sae';

import './ReceivablesChartStudio.css';

interface ReceivablesChartStudioProps {
  summary: SaeReceivablesSummaryResult;
  taxDisplayMode: TaxDisplayMode;
}

type AnalysisId =
  | 'sellerBilling'
  | 'seriesBilling'
  | 'warehouseBilling'
  | 'fiscalBilling'
  | 'invoiceStatus'
  | 'incomeMethod'
  | 'nonCash';

type ChartStyle = 'ranking' | 'columns' | 'donut';
type ChartMetric = 'amount' | 'count';
type BillingScope = 'active' | 'total';

interface AnalysisOption {
  id: AnalysisId;
  label: string;
  description: string;
  amountLabel: string;
  countLabel: string;
}

interface VisualDataPoint {
  key: string;
  label: string;
  amount: number;
  count: number;
}

const analysisOptions: AnalysisOption[] = [
  {
    id: 'sellerBilling',
    label: 'Facturación por vendedor',
    description: 'Compara cuánto facturó cada integrante comercial.',
    amountLabel: 'Importe facturado',
    countLabel: 'Facturas',
  },
  {
    id: 'seriesBilling',
    label: 'Facturación por serie',
    description: 'Identifica qué series concentran la facturación.',
    amountLabel: 'Importe facturado',
    countLabel: 'Facturas',
  },
  {
    id: 'warehouseBilling',
    label: 'Facturación por almacén',
    description: 'Compara el importe registrado por almacén.',
    amountLabel: 'Importe facturado',
    countLabel: 'Facturas',
  },
  {
    id: 'fiscalBilling',
    label: 'Facturación PUE vs. PPD',
    description: 'Distribuye las facturas por su método fiscal.',
    amountLabel: 'Importe facturado',
    countLabel: 'Facturas',
  },
  {
    id: 'invoiceStatus',
    label: 'Facturas vigentes y canceladas',
    description: 'Compara el estado actual de los documentos emitidos.',
    amountLabel: 'Importe registrado',
    countLabel: 'Facturas',
  },
  {
    id: 'incomeMethod',
    label: 'Ingresos por forma de pago',
    description: 'Sólo considera entradas reales de dinero.',
    amountLabel: 'Ingreso real',
    countLabel: 'Pagos',
  },
  {
    id: 'nonCash',
    label: 'Ajustes que no son ingreso',
    description: 'Devoluciones, créditos y otras reducciones de cartera.',
    amountLabel: 'Importe aplicado',
    countLabel: 'Movimientos',
  },
];

const palette = [
  '#5f86ff',
  '#55d6be',
  '#f2c45d',
  '#b392f7',
  '#f08a62',
  '#48b8e8',
  '#e879a8',
  '#86c66c',
  '#9da9bd',
  '#d79d55',
  '#6f7ee8',
  '#43b6a0',
];

const moneyFormatter = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
  maximumFractionDigits: 2,
});

const compactMoneyFormatter = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
  notation: 'compact',
  maximumFractionDigits: 1,
});

const integerFormatter = new Intl.NumberFormat('es-MX');

function fromFilterOptions(
  options: SaeReceivableFilterOption[],
  taxDisplayMode: TaxDisplayMode,
  billingScope: BillingScope = 'total',
): VisualDataPoint[] {
  return options.map((option) => ({
    key: option.value || option.label,
    label: option.label,
    amount: billingScope === 'active'
      ? taxDisplayMode === 'withTax'
        ? option.activeAmount ?? 0
        : option.activeAmountWithoutTax ?? 0
      : taxDisplayMode === 'withTax'
        ? option.amount
        : option.amountWithoutTax,
    count: billingScope === 'active'
      ? option.activeRecordCount ?? 0
      : option.recordCount,
  }));
}

function getDataPoints(
  analysis: AnalysisId,
  summary: SaeReceivablesSummaryResult,
  taxDisplayMode: TaxDisplayMode,
  billingScope: BillingScope,
): VisualDataPoint[] {
  switch (analysis) {
    case 'sellerBilling':
      return fromFilterOptions(
        summary.filterOptions.sellers,
        taxDisplayMode,
        billingScope,
      );
    case 'seriesBilling':
      return fromFilterOptions(summary.filterOptions.series, taxDisplayMode);
    case 'warehouseBilling':
      return fromFilterOptions(summary.filterOptions.warehouses, taxDisplayMode);
    case 'fiscalBilling':
      return fromFilterOptions(summary.filterOptions.fiscalPaymentMethods, taxDisplayMode);
    case 'invoiceStatus':
      return fromFilterOptions(summary.filterOptions.invoiceStatuses, taxDisplayMode);
    case 'incomeMethod':
      return summary.incomeBreakdown.map((item) => ({
        key: String(item.conceptNumber),
        label: item.description,
        amount: item.amount,
        count: item.movementCount,
      }));
    case 'nonCash':
      return summary.nonCashBreakdown.map((item) => ({
        key: String(item.conceptNumber),
        label: item.description,
        amount: item.amount,
        count: item.movementCount,
      }));
  }
}

function formatValue(value: number, metric: ChartMetric): string {
  return metric === 'amount'
    ? moneyFormatter.format(value)
    : integerFormatter.format(value);
}

function formatCompactValue(
  value: number,
  metric: ChartMetric,
): string {
  return metric === 'amount'
    ? compactMoneyFormatter.format(value)
    : integerFormatter.format(value);
}

export function ReceivablesChartStudio({
  summary,
  taxDisplayMode,
}: ReceivablesChartStudioProps) {
  const [analysisId, setAnalysisId] =
    useState<AnalysisId>('sellerBilling');
  const [chartStyle, setChartStyle] =
    useState<ChartStyle>('ranking');
  const [metric, setMetric] = useState<ChartMetric>('amount');
  const [itemLimit, setItemLimit] = useState(8);
  const [billingScope, setBillingScope] =
    useState<BillingScope>('active');

  const selectedAnalysis =
    analysisOptions.find((option) => option.id === analysisId) ??
    analysisOptions[0];

  const dataPoints = useMemo(
    () =>
      getDataPoints(analysisId, summary, taxDisplayMode, billingScope)
        .filter((point) =>
          metric === 'amount' ? point.amount > 0 : point.count > 0,
        )
        .sort(
          (left, right) =>
            (metric === 'amount' ? right.amount : right.count) -
            (metric === 'amount' ? left.amount : left.count),
        )
        .slice(0, itemLimit),
    [analysisId, billingScope, itemLimit, metric, summary, taxDisplayMode],
  );

  const total = dataPoints.reduce(
    (sum, point) =>
      sum + (metric === 'amount' ? point.amount : point.count),
    0,
  );
  const maximum = Math.max(
    ...dataPoints.map((point) =>
      metric === 'amount' ? point.amount : point.count,
    ),
    1,
  );

  let accumulatedShare = 0;
  const donutStops = dataPoints.map((point, index) => {
    const value = metric === 'amount' ? point.amount : point.count;
    const start = accumulatedShare;
    accumulatedShare += total > 0 ? (value / total) * 100 : 0;
    return `${palette[index % palette.length]} ${start}% ${accumulatedShare}%`;
  });

  return (
    <article className="portfolio-panel chart-studio">
      <div className="chart-studio-heading">
        <div className="chart-studio-title">
          <span>
            <Sparkles size={19} />
          </span>
          <div>
            <strong>Análisis visual</strong>
            <small>
              Configura la gráfica en tres pasos sencillos
            </small>
          </div>
        </div>
        <span className="chart-studio-scope">
          Datos reales del periodo
        </span>
      </div>

      <div className="chart-studio-config">
        <label>
          <span>1. ¿Qué quieres analizar?</span>
          <select
            value={analysisId}
            onChange={(event) =>
              setAnalysisId(event.target.value as AnalysisId)
            }
          >
            {analysisOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <fieldset>
          <legend>2. ¿Cómo quieres verlo?</legend>
          <div className="chart-style-picker">
            <button
              type="button"
              className={chartStyle === 'ranking' ? 'active' : ''}
              onClick={() => setChartStyle('ranking')}
              aria-pressed={chartStyle === 'ranking'}
              title="Ranking horizontal"
            >
              <Rows3 size={17} />
              <span>Ranking</span>
            </button>
            <button
              type="button"
              className={chartStyle === 'columns' ? 'active' : ''}
              onClick={() => setChartStyle('columns')}
              aria-pressed={chartStyle === 'columns'}
              title="Gráfica de columnas"
            >
              <ChartNoAxesColumn size={17} />
              <span>Columnas</span>
            </button>
            <button
              type="button"
              className={chartStyle === 'donut' ? 'active' : ''}
              onClick={() => setChartStyle('donut')}
              aria-pressed={chartStyle === 'donut'}
              title="Gráfica de distribución"
            >
              <ChartPie size={17} />
              <span>Distribución</span>
            </button>
          </div>
        </fieldset>

        <label>
          <span>3. Medir por</span>
          <select
            value={metric}
            onChange={(event) =>
              setMetric(event.target.value as ChartMetric)
            }
          >
            <option value="amount">{selectedAnalysis.amountLabel}</option>
            <option value="count">{selectedAnalysis.countLabel}</option>
          </select>
        </label>

        <label className="chart-limit-control">
          <span>
            {analysisId === 'sellerBilling' ? 'Vendedores' : 'Mostrar'}
          </span>
          <select
            value={itemLimit}
            onChange={(event) => setItemLimit(Number(event.target.value))}
          >
            <option value={5}>Top 5</option>
            <option value={8}>Top 8</option>
            <option value={12}>Top 12</option>
            <option value={20}>Top 20</option>
            <option value={summary.filterOptions.sellers.length}>
              Todos ({summary.filterOptions.sellers.length})
            </option>
          </select>
        </label>

        {analysisId === 'sellerBilling' && (
          <fieldset className="billing-scope-control">
            <legend>Facturación incluida</legend>
            <div
              className="billing-scope-picker"
              role="group"
              aria-label="Elegir facturación vigente o total"
            >
              <button
                type="button"
                className={billingScope === 'active' ? 'active' : ''}
                onClick={() => setBillingScope('active')}
                aria-pressed={billingScope === 'active'}
              >
                Facturado vigente
              </button>
              <button
                type="button"
                className={billingScope === 'total' ? 'active' : ''}
                onClick={() => setBillingScope('total')}
                aria-pressed={billingScope === 'total'}
              >
                Facturado total
              </button>
            </div>
            <small>
              {billingScope === 'active'
                ? 'No incluye documentos cancelados.'
                : 'Incluye documentos vigentes y cancelados.'}
            </small>
          </fieldset>
        )}
      </div>

      <div className="chart-studio-context">
        <div>
          <SlidersHorizontal size={15} />
          <span>{selectedAnalysis.description}</span>
        </div>
        {dataPoints[0] && (
          <p>
            Mayor aportación: <strong>{dataPoints[0].label}</strong>
            <b>
              {total > 0
                ? `${(
                    ((metric === 'amount'
                      ? dataPoints[0].amount
                      : dataPoints[0].count) /
                      total) *
                    100
                  ).toFixed(1)}%`
                : '0%'}
            </b>
          </p>
        )}
      </div>

      {dataPoints.length === 0 ? (
        <div className="chart-studio-empty">
          No hay datos para esta combinación en el periodo.
        </div>
      ) : (
        <div
          className={`chart-studio-visual ${chartStyle}`}
          role="img"
          aria-label={`${selectedAnalysis.label}, medida por ${
            metric === 'amount'
              ? selectedAnalysis.amountLabel
              : selectedAnalysis.countLabel
          }`}
        >
          {chartStyle === 'ranking' && (
            <div className="studio-ranking">
              {dataPoints.map((point, index) => {
                const value =
                  metric === 'amount' ? point.amount : point.count;
                return (
                  <div className="studio-ranking-row" key={point.key}>
                    <span>{index + 1}</span>
                    <div>
                      <strong title={point.label}>{point.label}</strong>
                      <i>
                        <b
                          style={{
                            width: `${Math.max(
                              2,
                              (value / maximum) * 100,
                            )}%`,
                            background: palette[index % palette.length],
                          }}
                        />
                      </i>
                    </div>
                    <b>{formatValue(value, metric)}</b>
                  </div>
                );
              })}
            </div>
          )}

          {chartStyle === 'columns' && (
            <div className="studio-columns">
              {dataPoints.map((point, index) => {
                const value =
                  metric === 'amount' ? point.amount : point.count;
                return (
                  <div className="studio-column" key={point.key}>
                    <b>{formatCompactValue(value, metric)}</b>
                    <div>
                      <i
                        style={{
                          height: `${Math.max(
                            3,
                            (value / maximum) * 100,
                          )}%`,
                          background: palette[index % palette.length],
                        }}
                      />
                    </div>
                    <span title={point.label}>{point.label}</span>
                  </div>
                );
              })}
            </div>
          )}

          {chartStyle === 'donut' && (
            <div className="studio-distribution">
              <div
                className="studio-donut"
                style={{
                  background: `conic-gradient(${donutStops.join(', ')})`,
                }}
              >
                <span>
                  <small>Total mostrado</small>
                  <strong>{formatCompactValue(total, metric)}</strong>
                </span>
              </div>
              <div className="studio-donut-legend">
                {dataPoints.map((point, index) => {
                  const value =
                    metric === 'amount' ? point.amount : point.count;
                  return (
                    <div key={point.key}>
                      <i
                        style={{
                          background: palette[index % palette.length],
                        }}
                      />
                      <span title={point.label}>{point.label}</span>
                      <strong>
                        {total > 0
                          ? `${((value / total) * 100).toFixed(1)}%`
                          : '0%'}
                      </strong>
                      <small>{formatValue(value, metric)}</small>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      <footer className="chart-studio-footer">
        La comparación por vendedor, serie, almacén, estado y método fiscal
        usa la facturación registrada del periodo. Los ingresos sólo incluyen
        movimientos monetarios clasificados como pago.
      </footer>
    </article>
  );
}
