import { FilterMultiSelect } from '../filters/FilterMultiSelect';
import { useAccess } from '../access/AccessContext';
import { RefreshButton } from '../filters/RefreshButton';
import { useSellerCatalog } from '../sellers/SellerCatalogContext';
import { SellerDescription } from '../sellers/SellerCatalogProvider';
import { TablePagination, TableResultCount } from '../tables/TablePagination';
import {
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
import { DatePeriodFilter, usePeriodFilter } from '../filters/DatePeriodFilter';

interface RecentDocumentsPanelProps {
  connection: SaeConnectionRequest;
  onSelectDocument: (
    kind: SaeDocumentKind,
    documentNumber: string,
  ) => void;
}


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
  const isExecutive = useAccess()?.role === 'Ejecutivo';
  const sellerCatalog = useSellerCatalog();
  const requestRef = useRef<AbortController | null>(null);
  const [query, setQuery] = useState('');
  const [sellerCode, setSellerCode] = useState('');
  const [branchCode, setBranchCode] = useState('');
  const [page, setPage] = useState(1);
  const period = usePeriodFilter('30days', () => setPage(1));
  const { from, to } = period.applied;
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
    try {
      const result = await getSalesFlowSummary(
        connection,
        from,
        to,
        sellerCode,
        controller.signal,
        'Order',
        page,
        pageSize,
        branchCode,
        query,
      );
      if (requestRef.current === controller && !controller.signal.aborted) {
        const lastPage = Math.max(1, Math.ceil(result.totalDocumentCount / pageSize));
        if (page > lastPage) { setPage(lastPage); return; }
        setDocuments(result.documents ?? []);
        setTotalDocuments(result.totalDocumentCount ?? 0);
      }
    } catch (loadError) {
      if (requestRef.current === controller && !controller.signal.aborted && (loadError as Error).name !== 'AbortError') {
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
  }, [connection, from, to, sellerCode, branchCode, page, query]);

  useEffect(() => {
    void load();
    return () => requestRef.current?.abort();
  }, [load]);

  const visibleDocuments = documents;

  return (
    <section className="recent-documents-view">
      <div className="recent-documents-toolbar module-filter-bar">
        <DatePeriodFilter filter={period} />

        <label className="module-filter-field"><span>Buscar pedido, cliente o vendedor</span><div className="recent-document-search">
          <Search size={15} />
          <input
            value={query}
            onChange={(event) => { setPage(1); setQuery(event.target.value); }}
            placeholder="Buscar pedido, cliente o vendedor"
          />
        </div></label>
        {!isExecutive && <label className="module-filter-field"><span>Vendedor</span><input
          className="recent-seller-filter"
          value={sellerCode}
          onChange={(event) => { setPage(1); setSellerCode(event.target.value); }}
          placeholder="Clave de vendedor"
          aria-label="Clave de vendedor"
        />{sellerCode.trim() && <small className="seller-filter-description">{sellerCatalog.description(sellerCode)}</small>}</label>}
        <FilterMultiSelect label="Sucursal" placeholder="Todas las sucursales" value={branchCode} options={branchOptions.map(([value,label]) => ({value,label}))} onChange={value => { setPage(1); setBranchCode(value); }} />

        <RefreshButton
          busy={isLoading}
          onClick={() => void load()}
          disabled={isLoading || period.pending || !!period.error}
          label="Actualizar documentos"
        />
      </div>

      <div className="recent-documents-panel">
      <div className="recent-documents-heading">
        <div>
          <h2>Actividad reciente · Pedidos</h2>
          <p>Selecciona un pedido para consultar sus remisiones y facturas relacionadas.</p>
        </div>
        <TableResultCount total={totalDocuments} noun="pedidos" busy={isLoading} />
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
              <span>Vendedor</span>
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
              <SellerDescription code={document.sellerCode} />
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
      <TablePagination page={page} total={totalDocuments} pageSize={pageSize} onPageChange={setPage} busy={isLoading} label="pedidos" />
      </div>
    </section>
  );
}
