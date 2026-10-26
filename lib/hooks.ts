'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from './api';

export interface PollState<T> {
  data: T | undefined;
  error: Error | undefined;
  loading: boolean;
  /** time of the last successful fetch */
  updatedAt: number | undefined;
  reload: () => Promise<void>;
}

/**
 * Small SWR-like hook: fetches on mount and whenever `key` changes, then every `intervalMs`
 * (skipped while the tab is hidden). Keeps the last good data when a refresh fails.
 * Pass `key = null` to disable.
 */
export function usePoll<T>(key: string | null, fetcher: () => Promise<T>, intervalMs = 0): PollState<T> {
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<Error | undefined>(undefined);
  const [loading, setLoading] = useState<boolean>(key !== null);
  const [updatedAt, setUpdatedAt] = useState<number | undefined>(undefined);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const seq = useRef(0);
  const keyRef = useRef(key);

  const run = useCallback(async () => {
    if (keyRef.current === null) return;
    const my = ++seq.current;
    try {
      const d = await fetcherRef.current();
      if (my !== seq.current) return;
      setData(d);
      setError(undefined);
      setUpdatedAt(Date.now());
    } catch (e) {
      if (my !== seq.current) return;
      if ((e as Error).name === 'AbortError') return;
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      if (my === seq.current) setLoading(false);
    }
  }, []);

  const prevKey = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    keyRef.current = key;
    if (key === null) {
      setLoading(false);
      prevKey.current = key;
      return;
    }
    if (prevKey.current !== key) {
      // new resource: drop stale data; an interval-only change keeps what we have
      prevKey.current = key;
      setLoading(true);
      setData(undefined);
      setError(undefined);
      void run();
    }
    if (!intervalMs) return;
    const t = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      void run();
    }, intervalMs);
    return () => clearInterval(t);
  }, [key, intervalMs, run]);

  return { data, error, loading, updatedAt, reload: run };
}

export type SSEHandlers = Record<string, (data: unknown) => void>;

/**
 * Server-Sent-Events subscription with exponential-backoff auto-reconnect.
 * Returns whether the stream is currently connected.
 */
export function useSSE(url: string | null, handlers: SSEHandlers): { connected: boolean; lastEventAt: number | undefined } {
  const [connected, setConnected] = useState(false);
  const [lastEventAt, setLastEventAt] = useState<number | undefined>(undefined);
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;
  const events = Object.keys(handlers).sort().join(',');

  useEffect(() => {
    if (!url || typeof window === 'undefined' || typeof EventSource === 'undefined') return;
    let es: EventSource | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let backoff = 1000;
    let closed = false;

    const connect = () => {
      if (closed) return;
      es = new EventSource(url);
      es.onopen = () => {
        backoff = 1000;
        setConnected(true);
      };
      es.onerror = () => {
        setConnected(false);
        es?.close();
        es = null;
        if (closed) return;
        timer = setTimeout(connect, backoff);
        backoff = Math.min(backoff * 2, 30_000);
      };
      for (const name of events.split(',').filter(Boolean)) {
        es.addEventListener(name, (ev) => {
          setLastEventAt(Date.now());
          let payload: unknown = null;
          try {
            payload = JSON.parse((ev as MessageEvent<string>).data);
          } catch {
            return;
          }
          handlersRef.current[name]?.(payload);
        });
      }
    };
    connect();
    return () => {
      closed = true;
      if (timer) clearTimeout(timer);
      es?.close();
      setConnected(false);
    };
  }, [url, events]);

  return { connected, lastEventAt };
}

/** Re-renders every `ms` and returns the current time (for countdowns / ages). */
export function useNow(ms = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

/** true when an error means the backend is unreachable */
export function isNetworkError(e: unknown): boolean {
  return e instanceof ApiError && e.network;
}

/** Persist a small UI preference in localStorage (per-viewer convenience only). */
export function usePref<T extends string>(key: string, initial: T): [T, (v: T) => void] {
  const [v, setV] = useState<T>(initial);
  useEffect(() => {
    try {
      const s = window.localStorage.getItem(`ch.pref.${key}`);
      if (s) setV(s as T);
    } catch {
      /* storage unavailable */
    }
  }, [key]);
  const set = useCallback(
    (nv: T) => {
      setV(nv);
      try {
        window.localStorage.setItem(`ch.pref.${key}`, nv);
      } catch {
        /* storage unavailable */
      }
    },
    [key],
  );
  return [v, set];
}
