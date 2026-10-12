import { useEffect, useRef, useState } from 'react';
import { localIsoDate, periodError } from '../../lib/datePeriod';
import { schedulePeriod, type SchedulePreset } from './schedule';

export function useSchedulePeriod(asOfDate?: string) {
  const [state, setState] = useState(() => {
    const dates = schedulePeriod('month', localIsoDate(new Date()));
    return { draft: dates, applied: dates, preset: 'month' as SchedulePreset | 'custom' };
  });
  const previousDate = useRef('');
  useEffect(() => {
    if (!asOfDate || previousDate.current === asOfDate) return;
    previousDate.current = asOfDate;
    setState(current => {
      if (current.preset === 'custom') return current;
      const dates = schedulePeriod(current.preset, asOfDate);
      return { ...current, draft: dates, applied: dates };
    });
  }, [asOfDate]);
  const error = periodError(state.draft);
  useEffect(() => {
    if (error || (state.draft.from === state.applied.from && state.draft.to === state.applied.to)) return;
    const timer = window.setTimeout(() => setState(current => ({ ...current, applied: current.draft })), 250);
    return () => window.clearTimeout(timer);
  }, [state.draft, state.applied, error]);
  return { ...state, error,
    selectPreset(preset: SchedulePreset) {
      const dates = schedulePeriod(preset, asOfDate ?? localIsoDate(new Date()));
      setState({ draft: dates, applied: dates, preset });
    },
    changeDate(field: 'from' | 'to', value: string) { setState(current => ({ ...current, preset: 'custom', draft: { ...current.draft, [field]: value } })); },
  };
}
