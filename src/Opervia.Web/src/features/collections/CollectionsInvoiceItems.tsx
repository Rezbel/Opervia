import { AlertTriangle, LoaderCircle, RotateCw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { getDocumentItems } from '../../lib/saeApi';
import type { SaeConnectionRequest, SaeDocumentItem, SaeDocumentItemsResult } from '../../types/sae';

const money = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });
const quantity = new Intl.NumberFormat('es-MX', { maximumFractionDigits: 4 });
const amount = (value: number | null) => value === null ? '—' : money.format(value);
function discounts(item: SaeDocumentItem) {
  const values = [item.discount1, item.discount2, item.discount3];
  if (values.every(value => value === null)) return '—';
  return values.filter((value): value is number => value !== null && value !== 0)
    .map(value => `${quantity.format(value)} %`).join(' / ') || '0 %';
}

export function CollectionsInvoiceItems({ connection, number, revision }: {
  connection: SaeConnectionRequest; number: string; revision: number;
}) {
  const [result, setResult] = useState<SaeDocumentItemsResult | null>(null);
  const [loading, setLoading] = useState(true), [error, setError] = useState(''), [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController(); setResult(null); setLoading(true); setError('');
    void getDocumentItems(connection, 'Invoice', number, controller.signal)
      .then(next => { if (!controller.signal.aborted) setResult(next); })
      .catch(failure => { if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : 'No fue posible consultar las partidas.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [connection, number, revision, retry]);
  return <div className="collections-inline-items" role="region" aria-label={`Partidas de ${number}`} aria-busy={loading}>
    <div className="collections-items-heading"><strong>Partidas</strong>{result && <span>{result.items.length} {result.items.length === 1 ? 'partida' : 'partidas'}</span>}</div>
    {loading && <div className="collections-items-loading" role="status"><LoaderCircle size={19} className="spin" /> Consultando partidas…</div>}
    {error && <div className="collections-items-error" role="alert"><AlertTriangle size={17} /><span>{error}</span><button type="button" onClick={() => setRetry(value => value + 1)}><RotateCw size={14} /> Reintentar</button></div>}
    {result && <>
      {result.isTruncated && <p className="collections-footnote" role="status">{result.message}</p>}
      <div className="collections-items-scroll"><table className="collections-table collections-items-table">
        <colgroup><col className="item-code" /><col className="item-description" /><col className="item-quantity" /><col className="item-price" /><col className="item-discount" /><col className="item-net" /><col className="item-gross" /></colgroup>
        <thead><tr><th scope="col">Clave</th><th scope="col">Descripción</th><th scope="col">Cantidad</th><th scope="col">Precio unitario<small>Sin IVA</small></th><th scope="col">Descuento</th><th scope="col">Total partida<small>Sin IVA</small></th><th scope="col">Total partida<small>Con IVA</small></th></tr></thead>
        <tbody>{result.items.map(item => <tr key={`${item.lineNumber}:${item.productCode}`}>
          <th scope="row">{item.productCode || 'Sin clave'}<small>Partida {item.lineNumber}</small></th><td>{item.description || 'Sin descripción'}</td>
          <td>{item.quantity === null ? '—' : quantity.format(item.quantity)}{item.salesUnit && item.salesUnit !== 'No aplica' && <small>{item.salesUnit}</small>}</td>
          <td>{amount(item.price)}</td><td title="Descuentos aplicados en secuencia">{discounts(item)}</td>
          <td>{amount(item.lineTotal)}</td><td><b>{amount(item.lineTotalWithTax)}</b></td>
        </tr>)}</tbody>
      </table></div>
      {!result.items.length && <p className="collections-empty-row">Esta factura no tiene partidas disponibles.</p>}
    </>}
  </div>;
}
