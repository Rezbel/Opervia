import { useEffect, useId, useRef, useState } from 'react';
import { CalendarDays } from 'lucide-react';
import { periodError, presetPeriod, type DatePeriod, type PeriodPreset } from '../../lib/datePeriod';
import './DatePeriodFilter.css';

export function usePeriodFilter(initial: PeriodPreset, onApply?: () => void) {
  const [state, setState] = useState(() => {
    const range = presetPeriod(initial);
    return { draft: range, applied: range, preset: initial as PeriodPreset | 'custom' };
  });
  const onApplyRef = useRef(onApply);
  onApplyRef.current = onApply;
  const error = periodError(state.draft);
  useEffect(() => {
    if (error || (state.draft.from === state.applied.from && state.draft.to === state.applied.to)) return;
    const timer = window.setTimeout(() => {
      onApplyRef.current?.();
      setState(previous => ({ ...previous, applied: previous.draft }));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [state.draft, state.applied, error]);
  return {
    ...state, error,
    pending: state.draft.from !== state.applied.from || state.draft.to !== state.applied.to,
    selectPreset(preset: PeriodPreset) {
      const range = presetPeriod(preset);
      onApplyRef.current?.();
      setState({ draft: range, applied: range, preset });
    },
    changeDate(field: keyof DatePeriod, value: string) {
      setState(previous => ({ ...previous, preset: 'custom', draft: { ...previous.draft, [field]: value } }));
    },
  };
}

export function DatePeriodFilter({ filter }: { filter: ReturnType<typeof usePeriodFilter> }) {
  const id = useId();
  return <div className="date-period-filter">
    <div className="date-period-presets" role="group" aria-label="Periodo de elaboración">
      {([['today', 'Hoy'], ['month', 'Este mes'], ['30days', 'Últimos 30 días'], ['year', 'Este año']] as const).map(([value, label]) =>
        <button type="button" key={value} className={filter.preset === value ? 'active' : ''} aria-pressed={filter.preset === value} onClick={() => filter.selectPreset(value)}>
          {value === 'today' && <CalendarDays size={14} />} {label}
        </button>)}
    </div>
    <label className="date-period-field"><span>Desde</span><input type="date" aria-label="Desde (elaboración)" value={filter.draft.from} max={filter.draft.to || undefined}
      aria-invalid={!!filter.error} aria-describedby={filter.error ? id : undefined} onChange={event => filter.changeDate('from', event.target.value)} /></label>
    <label className="date-period-field"><span>Hasta</span><input type="date" aria-label="Hasta (elaboración)" value={filter.draft.to} min={filter.draft.from || undefined}
      aria-invalid={!!filter.error} aria-describedby={filter.error ? id : undefined} onChange={event => filter.changeDate('to', event.target.value)} /></label>
    {filter.error && <p id={id} className="date-period-error" role="alert">{filter.error}</p>}
  </div>;
}
