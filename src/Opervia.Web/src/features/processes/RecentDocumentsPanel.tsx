import {
  CalendarDays,
  Eye,
  FileText,
  RefreshCw,
  Search,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { getSalesFlowSummary } from '../../lib/saeApi';
import type {
  SaeConnectionRequest,
  SaeDocumentKind,
  SaeSalesFlowDocumentListItem,
} from '../../types/sae';
import './RecentDocumentsPanel.css';

interface RecentDocumentsPanelProps {
  connection: SaeConnectionRequest;
  onSelectDocument: (
    kind: SaeDocumentKind,
    documentNumber: string,
  ) => void;
}

type PeriodPreset = 'today' | 'month' | '30days';

const kindLabels: Record<SaeDocumentKind, string> = {
  Quotation: 'Cotización',
  Order: 'Pedido',
  Delivery: 'Remisión',
  Invoice: 'Factura',
};

const branchOptions = [
  ['QR', 'Querétaro'], ['SL', 'San Luis Potosí'], ['XA', 'Xalapa'], ['HT', 'Huasteca'],
  ['EH', 'Equipos Huasteca'], ['EQ', 'Equipos Querétaro'], ['ES', 'Equipos San Luis Potosí'], ['EX', 'Equipos Xalapa'],
] as const;

function localIsoDate(date: Date): string {
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 10);
}

function periodDates(preset: PeriodPreset): { from: string; to: string } {
  const to = new Date();
  const from = new Date(to);
  if (preset === 'month') from.setDate(1);
  if (preset === '30days') from.setDate(from.getDate() - 29);
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
  onSelectDocument,
}: RecentDocumentsPanelProps) {
  const requestRef = useRef<AbortController | null>(null);
  const [period, setPeriod] = useState<PeriodPreset>('30days');
  const [query, setQuery] = useState('');
  const [sellerCode, setSellerCode] = useState('');
  const [branchCode, setBranchCode] = useState('');
  const [page, setPage] = useState(1);
  const [selectedDocumentKey, setSelectedDocumentKey] = useState('');
  const pageSize = 50;
  const [totalDocuments, setTotalDocuments] = useState(0);
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
        sellerCode,
        controller.signal,
        'Order',
        page,
        pageSize,
        branchCode,
        query,
      );
      setDocuments(result.documents ?? []);
      setTotalDocuments(result.totalDocumentCount ?? 0);
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
  }, [connection, period, sellerCode, branchCode, page, query]);

  useEffect(() => {
    void load();
    return () => requestRef.current?.abort();
  }, [load]);

  const visibleDocuments = documents;

  return (
    <section className="recent-documents-panel">
      <div className="recent-documents-heading">
        <div>
          <span className="eyebrow">PEDIDOS DEL PERIODO</span>
          <h2>Actividad reciente · Pedidos</h2>
          <p>Selecciona un pedido para consultar sus remisiones y facturas relacionadas.</p>
        </div>
        <span className="recent-documents-count">
          {visibleDocuments.length} pedidos
        </span>
      </div>

      <div className="recent-documents-toolbar">
        <div className="recent-periods" role="group" aria-label="Seleccionar periodo">
          {([
            ['today', 'Hoy'],
            ['month', 'Este mes'],
            ['30days', 'Últimos 30 días'],
          ] as const).map(([value, label]) => (
            <button
              type="button"
              key={value}
              className={period === value ? 'active' : ''}
              onClick={() => { setPage(1); setPeriod(value); }}
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
            onChange={(event) => { setPage(1); setQuery(event.target.value); }}
            placeholder="Buscar pedido, cliente o vendedor"
          />
        </label>
        <input
          className="recent-seller-filter"
          value={sellerCode}
          onChange={(event) => { setPage(1); setSellerCode(event.target.value); }}
          placeholder="Clave de vendedor"
          aria-label="Clave de vendedor"
        />
        <select
          value={branchCode}
          onChange={(event) => { setPage(1); setBranchCode(event.target.value); }}
          aria-label="Sucursal"
        >
          <option value="">Todas las sucursales</option>
          {branchOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
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
              <span>Cliente</span>
              <span>Vendedor (clave)</span>
            <span>Fecha</span>
              <span>Importe total sin IVA</span>
            <span />
          </div>
          {visibleDocuments.map((document) => {
            const documentKey = `${document.kind}:${document.documentNumber}`;
            const selected = selectedDocumentKey === documentKey;
            return (
            <button
              type="button"
              className={`recent-document-row${selected ? ' selected' : ''}`}
              key={documentKey}
              aria-pressed={selected}
              onClick={() => {
                setSelectedDocumentKey(documentKey);
                onSelectDocument(document.kind, document.documentNumber);
              }}
            >
              <span className={`recent-kind-icon ${document.kind.toLowerCase()}`}>
                <FileText size={16} />
              </span>
              <span className="recent-document-main">
                <strong>{document.documentNumber}</strong>
                <small>{kindLabels[document.kind]}</small>
              </span>
              <span className="recent-document-customer">
                <strong>{document.customerName || 'Nombre no disponible'}</strong>
                <small>{document.customerCode}</small>
              </span>
              <span>{document.sellerCode || 'Sin vendedor'}</span>
              <span>{date.format(new Date(document.documentDate))}</span>
              <span className="recent-document-amount">
                <strong>{currency.format(
                  document.amountBeforeTax,
                )}</strong>
              </span>
              <span className="recent-document-action">
                <Eye size={15} /> Ver flujo
              </span>
            </button>
            );
          })}
        </div>
      )}
      {totalDocuments > pageSize && (
        <div className="recent-pagination" aria-label="Paginación de pedidos">
          <button type="button" disabled={page === 1 || isLoading} onClick={() => setPage((value) => value - 1)}>Anterior</button>
          <span>Página {page} de {Math.max(1, Math.ceil(totalDocuments / pageSize))} · {totalDocuments} pedidos</span>
          <button type="button" disabled={page >= Math.ceil(totalDocuments / pageSize) || isLoading} onClick={() => setPage((value) => value + 1)}>Siguiente</button>
        </div>
      )}
    </section>
  );
}
