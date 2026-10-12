import { CalendarDays } from 'lucide-react';
import { useId } from 'react';
import type { useSchedulePeriod } from './useSchedulePeriod';
import '../filters/DatePeriodFilter.css';

export function ScheduleDateFilter({ filter }: { filter: ReturnType<typeof useSchedulePeriod> }) {
  const id = useId();
  return <div className="date-period-filter">
    <div className="date-period-presets" role="group" aria-label="Periodo de vencimiento">
      {([['today', 'Hoy'], ['month', 'Resto del mes'], ['7days', '7 días'], ['30days', '30 días'], ['90days', '90 días']] as const).map(([key, label]) =>
        <button type="button" key={key} className={filter.preset === key ? 'active' : ''} aria-pressed={filter.preset === key} onClick={() => filter.selectPreset(key)}>{key === 'today' && <CalendarDays size={14} />}{label}</button>)}
    </div>
    <label className="date-period-field"><span>Desde · vencimiento</span><input type="date" aria-label="Desde (vencimiento)" value={filter.draft.from} max={filter.draft.to || undefined} aria-invalid={!!filter.error} aria-describedby={filter.error ? id : undefined} onChange={event => filter.changeDate('from', event.target.value)} /></label>
    <label className="date-period-field"><span>Hasta · vencimiento</span><input type="date" aria-label="Hasta (vencimiento)" value={filter.draft.to} min={filter.draft.from || undefined} aria-invalid={!!filter.error} aria-describedby={filter.error ? id : undefined} onChange={event => filter.changeDate('to', event.target.value)} /></label>
    {filter.error && <p className="date-period-error" role="alert" id={id}>{filter.error} Se conserva el último rango válido.</p>}
  </div>;
}
