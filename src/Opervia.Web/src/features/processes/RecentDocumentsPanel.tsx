import {
  CalendarDays,
  Eye,
  FileText,
  RefreshCw,
  Search,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getSalesFlowSummary } from '../../lib/saeApi';
import type {
  SaeConnectionRequest,
  SaeDocumentKind,
  SaeSalesFlowDocumentListItem,
  TaxDisplayMode,
} from '../../types/sae';
import './RecentDocumentsPanel.css';

interface RecentDocumentsPanelProps {
  connection: SaeConnectionRequest;
  taxDisplayMode: TaxDisplayMode;
  onSelectDocument: (
    kind: SaeDocumentKind,
    documentNumber: string,
  ) => void;
}

type PeriodPreset = 'today' | 'month' | '30days' | 'year';
type KindFilter = 'all' | SaeDocumentKind;

const kindLabels: Record<SaeDocumentKind, string> = {
  Quotation: 'Cotización',
  Order: 'Pedido',
  Delivery: 'Remisión',
  Invoice: 'Factura',
};

function localIsoDate(date: Date): string {
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 10);
}

function periodDates(preset: PeriodPreset): { from: string; to: string } {
  const to = new Date();
  const from = new Date(to);
  if (preset === 'month') from.setDate(1);
  if (preset === '30days') from.setDate(from.getDate() - 29);
  if (preset === 'year') {
    from.setMonth(0);
    from.setDate(1);
  }
  return { from: localIsoDate(from), to: localIsoDate(to) };
}

const currency = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
  maximumFractionDigits: 2,
});

const date = new Intl.DateTimeFormat('es-MX', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});

export function RecentDocumentsPanel({
  connection,
  taxDisplayMode,
  onSelectDocument,
}: RecentDocumentsPanelProps) {
  const requestRef = useRef<AbortController | null>(null);
  const [period, setPeriod] = useState<PeriodPreset>('today');
  const [kind, setKind] = useState<KindFilter>('all');
  const [query, setQuery] = useState('');
  const [documents, setDocuments] =
    useState<SaeSalesFlowDocumentListItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const controller = new AbortController();
    requestRef.current?.abort();
    requestRef.current = controller;
    setIsLoading(true);
    setError(null);
    const selectedPeriod = periodDates(period);
    try {
      const result = await getSalesFlowSummary(
        connection,
        selectedPeriod.from,
        selectedPeriod.to,
        '',
        controller.signal,
      );
      setDocuments(result.documents ?? []);
    } catch (loadError) {
      if ((loadError as Error).name !== 'AbortError') {
        setError(loadError instanceof Error
          ? loadError.message
          : 'No fue posible cargar los documentos.');
      }
    } finally {
      if (requestRef.current === controller) {
        requestRef.current = null;
        setIsLoading(false);
      }
    }
  }, [connection, period]);

  useEffect(() => {
    void load();
    return () => requestRef.current?.abort();
  }, [load]);

  const visibleDocuments = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase('es-MX');
    return documents.filter((document) => {
      if (kind !== 'all' && document.kind !== kind) return false;
      if (!normalizedQuery) return true;
      return [
        document.documentNumber,
        document.customerCode,
        document.sellerCode ?? '',
      ].some((value) => value.toLocaleLowerCase('es-MX').includes(normalizedQuery));
    });
  }, [documents, kind, query]);

  return (
    <section className="recent-documents-panel">
      <div className="recent-documents-heading">
        <div>
          <span className="eyebrow">DOCUMENTOS DEL PERIODO</span>
          <h2>Actividad reciente</h2>
          <p>Selecciona cualquier documento para reconstruir y consultar su flujo.</p>
        </div>
        <span className="recent-documents-count">
          {visibleDocuments.length} documentos
        </span>
      </div>

      <div className="recent-documents-toolbar">
        <div className="recent-periods" role="group" aria-label="Seleccionar periodo">
          {([
            ['today', 'Hoy'],
            ['month', 'Este mes'],
            ['30days', 'Últimos 30 días'],
            ['year', 'Este año'],
          ] as const).map(([value, label]) => (
            <button
              type="button"
              key={value}
              className={period === value ? 'active' : ''}
              onClick={() => setPeriod(value)}
            >
              {value === 'today' && <CalendarDays size={14} />}
              {label}
            </button>
          ))}
        </div>

        <label className="recent-document-search">
          <Search size={15} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar documento, cliente o vendedor"
          />
        </label>

        <select
          aria-label="Filtrar por tipo de documento"
          value={kind}
          onChange={(event) => setKind(event.target.value as KindFilter)}
        >
          <option value="all">Todos los tipos</option>
          {Object.entries(kindLabels).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>

        <button
          type="button"
          className="recent-documents-refresh"
          onClick={() => void load()}
          disabled={isLoading}
          aria-label="Actualizar documentos"
        >
          <RefreshCw className={isLoading ? 'spin' : ''} size={16} />
        </button>
      </div>

      {error ? (
        <div className="recent-documents-empty">{error}</div>
      ) : isLoading && documents.length === 0 ? (
        <div className="recent-documents-empty">
          <RefreshCw className="spin" size={20} /> Consultando SAE…
        </div>
      ) : visibleDocuments.length === 0 ? (
        <div className="recent-documents-empty">
          <FileText size={22} />
          No hay documentos que coincidan en este periodo.
        </div>
      ) : (
        <div className="recent-documents-table">
          <div className="recent-documents-table-head">
            <span>Documento</span>
            <span>Cliente / vendedor</span>
            <span>Fecha</span>
            <span>Importe</span>
            <span />
          </div>
          {visibleDocuments.map((document) => (
            <button
              type="button"
              className="recent-document-row"
              key={`${document.kind}:${document.documentNumber}`}
              onClick={() => onSelectDocument(document.kind, document.documentNumber)}
            >
              <span className={`recent-kind-icon ${document.kind.toLowerCase()}`}>
                <FileText size={16} />
              </span>
              <span className="recent-document-main">
                <strong>{document.documentNumber}</strong>
                <small>{kindLabels[document.kind]}</small>
              </span>
              <span className="recent-document-customer">
                <strong>Cliente {document.customerCode}</strong>
                <small>{document.sellerCode || 'Sin vendedor'}</small>
              </span>
              <span>{date.format(new Date(document.documentDate))}</span>
              <span className="recent-document-amount">
                <strong>{currency.format(
                  taxDisplayMode === 'withTax'
                    ? document.amountWithTax
                    : document.amountBeforeTax,
                )}</strong>
                <small className={document.isCancelled ? 'cancelled' : 'active'}>
                  {document.isCancelled ? 'Cancelado' : 'Vigente'}
                </small>
              </span>
              <span className="recent-document-action">
                <Eye size={15} /> Ver flujo
              </span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
