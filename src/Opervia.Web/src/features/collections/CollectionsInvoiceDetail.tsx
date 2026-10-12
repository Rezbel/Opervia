import { AlertTriangle, CheckCircle2, LoaderCircle, ReceiptText, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { getReceivableInvoiceAccount } from '../../lib/saeApi';
import type { SaeConnectionRequest, SaeReceivableInvoiceAccountResult } from '../../types/sae';
import { collectionMoney, collectionDate } from './collections';

export function CollectionsInvoiceDetail({ connection, number, revision, onClose }: {
  connection: SaeConnectionRequest; number: string; revision: number; onClose: () => void;
}) {
  const [result, setResult] = useState<SaeReceivableInvoiceAccountResult | null>(null);
  const [loading, setLoading] = useState(true), [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setResult(null); setError('');
    void getReceivableInvoiceAccount(connection, number, controller.signal).then(next => {
      if (controller.signal.aborted) return;
      if (!next.isSuccessful || !next.invoice) throw new Error(next.message);
      setResult(next);
    }).catch(e => { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'No fue posible consultar la factura.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [connection, number, revision]);
  const invoice = result?.invoice;
  return <section className="collections-panel collections-reveal" aria-busy={loading}>
    <header className="collections-heading"><div><h2><ReceiptText size={20} /> Cuenta de {number}</h2><p>Todos los cargos y abonos de la factura, incluidos los plazos ya pagados.</p></div>
      <button className="collections-close" type="button" aria-label="Cerrar cuenta de factura" onClick={onClose}><X size={18} /></button></header>
    {loading && <div className="collections-loading" role="status"><LoaderCircle className="spin" size={24} /> Consultando cargos y pagos en SAE…</div>}
    {error && <p className="collections-error" role="alert"><AlertTriangle size={18} />{error}</p>}
    {invoice && <>
      <div className="collections-invoice-metrics">
        <div><span>Total de factura con IVA</span><strong>{collectionMoney(Math.round(invoice.amountWithVat * 100))}</strong></div>
        <div><span>Abonos y reducciones</span><strong>{collectionMoney(Math.round(invoice.appliedReductions * 100))}</strong></div>
        <div><span>Saldo de la factura con IVA</span><strong>{invoice.balance == null ? 'Sin datos' : collectionMoney(Math.round(invoice.balance * 100))}</strong></div>
        <div><span>Estado</span><strong>{invoice.status === 'Liquidada' && <CheckCircle2 size={17} />} {invoice.status}</strong></div>
      </div>
      <div className="collections-table-scroll"><table className="collections-table">
        <thead><tr><th>Movimiento</th><th>Aplicación</th><th>Referencia / cargo</th><th>Vencimiento</th><th>Importe con IVA</th><th>Saldo del cargo</th><th>Estado</th></tr></thead>
        <tbody>{result?.movements.map(row => <tr key={row.key}>
          <td><b>{row.conceptDescription}</b><small>{row.isOriginalCharge ? 'Cargo original' : 'Abono / aplicación'}</small></td>
          <td>{collectionDate(row.applicationDate)}</td><td>{row.reference}<small>Cargo {row.chargeNumber}</small></td>
          <td>{row.isOriginalCharge ? collectionDate(row.dueDate) : '—'}</td>
          <td className={row.signedAmount < 0 ? 'collections-credit' : ''}>{collectionMoney(Math.round(row.signedAmount * 100))}</td>
          <td>{row.isOriginalCharge && row.chargeBalance != null ? collectionMoney(Math.round(row.chargeBalance * 100)) : '—'}</td>
          <td>{row.isOriginalCharge ? row.chargeStatus ?? 'Sin datos' : 'Aplicación'}</td>
        </tr>)}</tbody>
      </table></div>
      <p className="collections-footnote">El importe conserva el movimiento original; el saldo de cada cargo ya descuenta sus aplicaciones. Los abonos no se suman nuevamente al saldo.</p>
    </>}
  </section>;
}
