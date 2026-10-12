import './TablePagination.css';

interface Props {
  page: number;
  total: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  busy?: boolean;
  label: string;
  onPageSizeChange?: (size: number) => void;
  pageSizeOptions?: readonly number[];
}

export function TablePagination({ page, total, pageSize, onPageChange, busy = false,
  label, onPageSizeChange, pageSizeOptions = [10, 30, 60, 100] }: Props) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.max(1, Math.min(page, pages));
  return <div className="table-pagination" aria-label={`Paginación de ${label}`}>
    <div className="table-page-navigation">
      <button type="button" disabled={busy || current <= 1} onClick={() => onPageChange(current - 1)}>Anterior</button>
      <span aria-live="polite">Página {current} de {pages}</span>
      <button type="button" disabled={busy || current >= pages} onClick={() => onPageChange(current + 1)}>Siguiente</button>
    </div>
    {onPageSizeChange && <label className="table-page-size">Mostrar
      <select value={pageSize} disabled={busy} aria-label={`${label} por página`}
        onChange={event => onPageSizeChange(Number(event.target.value))}>
        {pageSizeOptions.map(size => <option key={size} value={size}>{size}</option>)}
      </select>por página
    </label>}
  </div>;
}

export function TableResultCount({ total, noun, busy = false }: { total: number; noun: string; busy?: boolean }) {
  return <span className="table-result-count" role="status" aria-live="polite">
    {busy ? 'Consultando…' : `${total.toLocaleString('es-MX')} ${noun}`}
  </span>;
}
