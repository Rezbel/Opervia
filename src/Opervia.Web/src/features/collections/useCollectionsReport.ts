import { useCallback, useEffect, useRef, useState } from 'react';
import { getCollectionsControl } from '../../lib/saeApi';
import type { SaeConnectionRequest } from '../../types/sae';
import type { SaeCollectionsControlResult } from './collections';

export function useCollectionsReport(connection: SaeConnectionRequest | null) {
  const [snapshot, setSnapshot] = useState<{ connection: SaeConnectionRequest; report: SaeCollectionsControlResult } | null>(null);
  const [loading, setLoading] = useState(false), [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const request = useRef<AbortController | null>(null);
  const refresh = useCallback(async () => {
    if (!connection) return;
    request.current?.abort();
    const controller = new AbortController(); request.current = controller; setLoading(true); setError('');
    try {
      const next = await getCollectionsControl(connection, controller.signal);
      if (request.current === controller && !controller.signal.aborted) { setSnapshot({ connection, report: next }); setRevision(value => value + 1); }
    } catch (e) {
      if (request.current === controller && !controller.signal.aborted) setError(e instanceof Error ? e.message : 'No fue posible consultar la cartera.');
    } finally {
      if (request.current === controller) { request.current = null; setLoading(false); }
    }
  }, [connection]);
  useEffect(() => { setSnapshot(null); setError(''); setLoading(false); void refresh(); return () => request.current?.abort(); }, [refresh]);
  useEffect(() => {
    const revalidate = () => { if (document.visibilityState === 'visible' && !request.current) void refresh(); };
    const timer = window.setInterval(revalidate, 60_000);
    document.addEventListener('visibilitychange', revalidate); window.addEventListener('online', revalidate);
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', revalidate); window.removeEventListener('online', revalidate); };
  }, [refresh]);
  return { report: snapshot?.connection === connection ? snapshot?.report ?? null : null, loading, error, revision, refresh };
}
