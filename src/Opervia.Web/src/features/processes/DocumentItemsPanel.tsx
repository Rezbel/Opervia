import {
  Boxes,
  Hash,
  Package,
  Store,
  X,
} from 'lucide-react';

import type {
  SaeDocumentItemsResult,
  TaxDisplayMode,
} from '../../types/sae';

import './DocumentItemsPanel.css';

interface DocumentItemsPanelProps {
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
              <span>Cantidad total</span>
              <strong>
                {formatQuantity(result.totalQuantity)}
              </strong>
            </article>

            <article>
              <span>
                {result.isTruncated
                  ? 'Subtotal mostrado'
                  : 'Subtotal'}
              </span>
              <strong>
                {formatCurrency(
                  taxDisplayMode === 'withTax'
                    ? result.totalAmountWithTax
                    : result.totalAmount,
                )}
              </strong>
            </article>
          </section>

          {result.isTruncated && (
            <div className="document-items-warning" role="status">
              {result.message} Los totales corresponden únicamente
              a las partidas visibles.
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
                    <span>Precio</span>
                    <strong>
                      {formatCurrency(
                        taxDisplayMode === 'withTax'
                          ? item.priceWithTax
                          : item.price,
                      )}
                    </strong>
                  </div>

                  <div>
                    <span>Almacén</span>
                    <strong>
                      <Store size={13} />
                      {item.warehouseNumber ?? 'N/D'}
                    </strong>
                  </div>

                  <div>
                    <span>Movimiento</span>
                    <strong>
                      <Hash size={13} />
                      {item.movementNumber &&
                      item.movementNumber > 0
                        ? item.movementNumber
                        : 'Sin movimiento'}
                    </strong>
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
