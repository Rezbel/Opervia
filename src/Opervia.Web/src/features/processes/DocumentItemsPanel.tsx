import {
  Boxes,
  Package,
  Store,
  X,
} from 'lucide-react';

import type {
  SaeDocumentItemsResult,
  SaeSalesFlowNode,
  TaxDisplayMode,
} from '../../types/sae';

import './DocumentItemsPanel.css';

interface DocumentItemsPanelProps {
  document?: SaeSalesFlowNode | null;
  result: SaeDocumentItemsResult | null;
  isLoading: boolean;
  error: string | null;
  taxDisplayMode: TaxDisplayMode;
  onClose: () => void;
}

function formatCurrency(
  value: number | null,
): string {
  if (value === null) {
    return '—';
  }

  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
  }).format(value);
}

function formatQuantity(
  value: number | null,
): string {
  if (value === null) {
    return '—';
  }

  return new Intl.NumberFormat('es-MX', {
    maximumFractionDigits: 4,
  }).format(value);
}

export function DocumentItemsPanel({
  document,
  result,
  isLoading,
  error,
  taxDisplayMode,
  onClose,
}: DocumentItemsPanelProps) {
  return (
    <aside className="document-items-panel">
      <header className="document-items-header">
        <div className="document-items-heading">
          <div className="document-items-icon">
            <Boxes size={21} />
          </div>

          <div>
            <span>DETALLE DEL DOCUMENTO</span>

            <h2>
              {result?.documentNumber ??
                'Partidas de la operación'}
            </h2>
          </div>
        </div>

        <button
          type="button"
          className="document-items-close"
          onClick={onClose}
          aria-label="Cerrar detalle"
        >
          <X size={18} />
        </button>
      </header>

      {document && <section className="document-context" aria-label="Información del documento">
        <h3>{document.documentNumber}</h3>
        <dl>
          <div><dt>Cliente</dt><dd>{document.customerName || 'Nombre no disponible'} · {document.customerCode}</dd></div>
          <div><dt>Vendedor (clave)</dt><dd>{document.salespersonCode || 'No disponible'}</dd></div>
          <div><dt>Fecha</dt><dd>{document.documentDate?.slice(0, 10) || 'No disponible'}</dd></div>
          <div><dt>Almacén de cabecera</dt><dd>{document.warehouseNumber ?? 'No disponible'}</dd></div>
        </dl>
      </section>}
      {isLoading && (
        <div className="document-items-state">
          <div className="document-items-spinner" />

          <strong>Cargando partidas...</strong>

          <p>
            Opervia está consultando el detalle del
            documento en SAE.
          </p>
        </div>
      )}

      {!isLoading && error && (
        <div className="document-items-error">
          <strong>No fue posible cargar el detalle.</strong>

          <p>{error}</p>
        </div>
      )}

      {!isLoading && !error && result && (
        <>
          <section className="document-items-summary">
            <article>
              <span>Partidas</span>
              <strong>{result.items.length}</strong>
            </article>

            <article>
              <span>Total completo sin IVA</span>
              <strong>{formatCurrency(document?.amountBeforeTax ?? result.totalAmount)}</strong>
            </article>

            <article>
              <span>Total completo con IVA</span>
              <strong>{formatCurrency(document?.amount ?? result.totalAmountWithTax)}</strong>
            </article>

          </section>

          {result.isTruncated && (
            <div className="document-items-warning" role="status">
              {result.message} El listado muestra únicamente
              las partidas visibles; los totales generales están arriba.
            </div>
          )}

          <div className="document-items-list">
            {result.items.map((item) => (
              <article
                className="document-item-card"
                key={`${item.lineNumber}-${item.productCode ?? 'sin-clave'}`}
              >
                <div className="document-item-top">
                  <div className="document-item-product-icon">
                    <Package size={18} />
                  </div>

                  <div className="document-item-name">
                    <span>
                      PARTIDA {item.lineNumber}
                    </span>

                    <strong>
                      {item.productCode ||
                        'Producto sin clave'}
                    </strong>

                    {item.description && (
                      <p>{item.description}</p>
                    )}
                  </div>

                  <strong className="document-item-total">
                    {formatCurrency(
                      taxDisplayMode === 'withTax'
                        ? item.lineTotalWithTax
                        : item.lineTotal,
                    )}
                  </strong>
                </div>

                <div className="document-item-data">
                  <div>
                    <span>Cantidad</span>
                    <strong>
                      {formatQuantity(item.quantity)}
                      {item.salesUnit &&
                      item.salesUnit !== 'No aplica'
                        ? ` ${item.salesUnit}`
                        : ''}
                    </strong>
                  </div>

                  <div>
                    <span>Precio por producto</span>
                    <strong>
                      {formatCurrency(
                        taxDisplayMode === 'withTax'
                          ? item.priceWithTax
                          : item.price,
                      )}
                    </strong>
                  </div>

                  <div>
                    <span>Descuentos</span>
                    <strong>{[item.discount1, item.discount2, item.discount3].filter((value): value is number => value !== null && value !== 0).join(' / ') || '0'}%</strong>
                  </div>

                  <div>
                    <span>IVA</span>
                    <strong>{formatCurrency(item.taxAmount)}</strong>
                  </div>

                  <div>
                    <span>Almacén</span>
                    <strong>
                      <Store size={13} />
                      {item.warehouseNumber ?? 'N/D'}
                    </strong>
                  </div>

                  <div>
                    <span>Total partida con IVA</span>
                    <strong>{formatCurrency(item.lineTotalWithTax)}</strong>
                  </div>

                </div>

                {item.lotLink !== null &&
                  item.lotLink > 0 && (
                    <div className="document-item-lot">
                      Vínculo de lote/pedimento:
                      <strong>{item.lotLink}</strong>
                    </div>
                  )}
              </article>
            ))}
          </div>

          <footer className="document-items-footer">
            <span>
              Tabla consultada: {result.tableName}
            </span>

            <span>
              {result.elapsedMilliseconds} ms
            </span>
          </footer>
        </>
      )}
    </aside>
  );
}
