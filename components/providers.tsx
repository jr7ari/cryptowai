'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { API_URL, api, errorMessage } from '@/lib/api';
import { usePoll, useSSE } from '@/lib/hooks';
import type { AlertRecord, DecisionRecord, EngineStatus, Position } from '@/lib/types';

// ------------------------------------------------------------------ toasts
type ToastKind = 'ok' | 'error' | 'info';
interface Toast {
  id: number;
  kind: ToastKind;
  text: string;
}
const ToastCtx = createContext<(text: string, kind?: ToastKind) => void>(() => undefined);

export function useToast() {
  return useContext(ToastCtx);
}

/** Run a mutation with busy state and toast feedback. */
export function useAction() {
  const notify = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const run = useCallback(
    async <T,>(label: string, fn: () => Promise<T>, success?: (r: T) => string | null): Promise<T | undefined> => {
      setBusy(label);
      try {
        const r = await fn();
        const msg = success ? success(r) : `${label}: done`;
        if (msg) notify(msg, 'ok');
        return r;
      } catch (e) {
        notify(`${label} failed: ${errorMessage(e)}`, 'error');
        return undefined;
      } finally {
        setBusy(null);
      }
    },
    [notify],
  );
  return { run, busy };
}

// ------------------------------------------------------------------ engine status + stream
interface EngineCtxValue {
  status: EngineStatus | undefined;
  statusError: Error | undefined;
  statusLoading: boolean;
  statusUpdatedAt: number | undefined;
  refreshStatus: () => Promise<void>;
  streamConnected: boolean;
  /** decisions received over SSE this session, newest first */
  liveDecisions: DecisionRecord[];
  /** increments on every SSE position / alert event: pages use it to refetch */
  positionTick: number;
  alertTick: number;
  lastAlert: AlertRecord | undefined;
}

const EngineCtx = createContext<EngineCtxValue | null>(null);

export function useEngine(): EngineCtxValue {
  const v = useContext(EngineCtx);
  if (!v) throw new Error('useEngine must be used inside <Providers>');
  return v;
}

export function Providers({ children }: { children: ReactNode }) {
  // toasts
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);
  const notify = useCallback((text: string, kind: ToastKind = 'info') => {
    const id = nextId.current++;
    setToasts((t) => [...t.slice(-4), { id, kind, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === 'error' ? 9000 : 5000);
  }, []);

  // engine stream
  const [sseStatus, setSseStatus] = useState<{ s: EngineStatus; at: number } | undefined>(undefined);
  const [liveDecisions, setLiveDecisions] = useState<DecisionRecord[]>([]);
  const [positionTick, setPositionTick] = useState(0);
  const [alertTick, setAlertTick] = useState(0);
  const [lastAlert, setLastAlert] = useState<AlertRecord | undefined>(undefined);

  const handlers = useMemo(
    () => ({
      status: (d: unknown) => {
        if (d && typeof d === 'object') setSseStatus({ s: d as EngineStatus, at: Date.now() });
      },
      decision: (d: unknown) => {
        if (d && typeof d === 'object') setLiveDecisions((xs) => [d as DecisionRecord, ...xs.filter((x) => x.id !== (d as DecisionRecord).id)].slice(0, 50));
      },
      position: (p: unknown) => {
        void (p as Position | null);
        setPositionTick((n) => n + 1);
      },
      alert: (a: unknown) => {
        setLastAlert(a as AlertRecord);
        setAlertTick((n) => n + 1);
      },
    }),
    [],
  );
  const { connected } = useSSE(`${API_URL}/api/stream`, handlers);
  // polling fallback: fast while the stream is down, slow while it is up
  const poll = usePoll('status', api.status, connected ? 30_000 : 5_000);

  useEffect(() => {
    if (lastAlert && (lastAlert.level === 'critical' || lastAlert.level === 'error')) notify(`${lastAlert.code}: ${lastAlert.message}`, 'error');
  }, [lastAlert, notify]);

  const polledAt = poll.updatedAt ?? 0;
  const status = sseStatus && sseStatus.at >= polledAt ? sseStatus.s : (poll.data ?? sseStatus?.s);
  const statusUpdatedAt = Math.max(polledAt, sseStatus?.at ?? 0) || undefined;
  // a successful SSE status clears a stale poll error
  const statusError = connected && sseStatus ? undefined : poll.error;

  const value: EngineCtxValue = {
    status,
    statusError,
    statusLoading: poll.loading && !status,
    statusUpdatedAt,
    refreshStatus: poll.reload,
    streamConnected: connected,
    liveDecisions,
    positionTick,
    alertTick,
    lastAlert,
  };

  return (
    <ToastCtx.Provider value={notify}>
      <EngineCtx.Provider value={value}>
        {children}
        <div className="toasts" aria-live="polite" aria-atomic="false">
          {toasts.map((t) => (
            <div key={t.id} className={`toast toast-${t.kind}`} role={t.kind === 'error' ? 'alert' : 'status'}>
              <span>{t.text}</span>
              <button type="button" className="btn btn-ghost btn-sm" aria-label="Dismiss" onClick={() => setToasts((xs) => xs.filter((x) => x.id !== t.id))}>
                ✕
              </button>
            </div>
          ))}
        </div>
      </EngineCtx.Provider>
    </ToastCtx.Provider>
  );
}
