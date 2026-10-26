'use client';

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { errorMessage } from '@/lib/api';
import { isNetworkError } from '@/lib/hooks';
import { regimeColor, regimeLabel } from '@/lib/regimes';
import { API_URL } from '@/lib/api';
import type { Signal } from '@/lib/types';

export function Card({
  title,
  actions,
  children,
  className,
  subtitle,
  id,
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <section className={`card ${className ?? ''}`} id={id} aria-label={typeof title === 'string' ? title : undefined}>
      {(title || actions) && (
        <header className="card-head">
          <div>
            {title && <h2 className="card-title">{title}</h2>}
            {subtitle && <div className="card-sub">{subtitle}</div>}
          </div>
          {actions && <div className="card-actions">{actions}</div>}
        </header>
      )}
      <div className="card-body">{children}</div>
    </section>
  );
}

export function Kpi({ label, value, tone, hint }: { label: string; value: ReactNode; tone?: 'pos' | 'neg' | 'warn' | 'info' | ''; hint?: ReactNode }) {
  return (
    <div className="kpi">
      <div className="kpi-label">{label}</div>
      <div className={`kpi-value ${tone ?? ''}`}>{value}</div>
      {hint !== undefined && <div className="kpi-hint">{hint}</div>}
    </div>
  );
}

export type BadgeTone = 'green' | 'red' | 'amber' | 'blue' | 'grey' | 'purple';

export function Badge({ tone = 'grey', children, title, pulse }: { tone?: BadgeTone; children: ReactNode; title?: string; pulse?: boolean }) {
  return (
    <span className={`badge badge-${tone} ${pulse ? 'pulse' : ''}`} title={title}>
      {children}
    </span>
  );
}

export function RegimeBadge({ regime, confidence }: { regime: string | null | undefined; confidence?: number }) {
  const c = regimeColor(regime);
  return (
    <span className="regime-badge" style={{ borderColor: c, color: c }} title={regime ?? undefined}>
      <span className="dot" style={{ background: c }} aria-hidden />
      {regimeLabel(regime)}
      {confidence !== undefined && Number.isFinite(confidence) && <span className="muted"> {(confidence * 100).toFixed(0)}%</span>}
    </span>
  );
}

const SIGNAL_TONE: Record<Signal, BadgeTone> = { BULL: 'green', BEAR: 'red', HIGH: 'amber', LOW: 'blue', NEUTRAL: 'grey' };
export function SignalBadge({ signal }: { signal: Signal }) {
  return <Badge tone={SIGNAL_TONE[signal] ?? 'grey'}>{signal}</Badge>;
}

export function PassFail({ passed, label }: { passed: boolean; label?: string }) {
  return <Badge tone={passed ? 'green' : 'red'}>{label ?? (passed ? 'PASS' : 'FAIL')}</Badge>;
}

export function EmptyState({ title = 'Nothing here yet', children }: { title?: string; children?: ReactNode }) {
  return (
    <div className="empty" role="status">
      <div className="empty-title">{title}</div>
      {children && <div className="empty-body">{children}</div>}
    </div>
  );
}

export function ErrorBanner({ error, onRetry, compact }: { error: unknown; onRetry?: () => void; compact?: boolean }) {
  if (!error) return null;
  const net = isNetworkError(error);
  return (
    <div className={`banner banner-error ${compact ? 'compact' : ''}`} role="alert">
      <div>
        <strong>{net ? 'Backend unreachable.' : 'Request failed.'}</strong>{' '}
        {net ? `Could not reach the trading engine API at ${API_URL}. Showing the last known data, if any.` : errorMessage(error)}
      </div>
      {onRetry && (
        <button type="button" className="btn btn-sm" onClick={onRetry}>
          Retry
        </button>
      )}
    </div>
  );
}

export function Loading({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="loading" role="status" aria-live="polite">
      <span className="spinner" aria-hidden /> {label}
    </div>
  );
}

/** Loading / error / empty wrapper for polled data. */
export function DataState<T>({
  data,
  error,
  loading,
  reload,
  empty,
  emptyTitle,
  children,
}: {
  data: T | undefined;
  error: unknown;
  loading: boolean;
  reload?: () => void;
  empty?: (d: T) => boolean;
  emptyTitle?: string;
  children: (d: T) => ReactNode;
}) {
  return (
    <>
      {error ? <ErrorBanner error={error} onRetry={reload} compact /> : null}
      {data === undefined ? (
        loading ? (
          <Loading />
        ) : error ? null : (
          <EmptyState title={emptyTitle ?? 'No data'} />
        )
      ) : empty?.(data) ? (
        <EmptyState title={emptyTitle ?? 'No data'} />
      ) : (
        children(data)
      )}
    </>
  );
}

/** Utilisation bar: amber above 70%, red above 90% of the limit. */
export function UtilBar({ label, value, limit, format }: { label: string; value: number; limit: number; format?: (v: number) => string }) {
  const f = format ?? ((v: number) => v.toFixed(2));
  const ratio = limit > 0 ? Math.max(0, value) / limit : 0;
  const pct = Math.min(100, ratio * 100);
  const tone = ratio > 0.9 ? 'red' : ratio > 0.7 ? 'amber' : 'green';
  return (
    <div className="utilbar">
      <div className="utilbar-head">
        <span>{label}</span>
        <span className={`utilbar-val ${tone}`}>
          {f(value)} / {f(limit)} <span className="muted">({(ratio * 100).toFixed(0)}%)</span>
        </span>
      </div>
      <div
        className="utilbar-track"
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(pct)}
      >
        <div className={`utilbar-fill ${tone}`} style={{ width: `${pct}%` }} />
        <div className="utilbar-mark" style={{ left: '70%' }} aria-hidden />
        <div className="utilbar-mark" style={{ left: '90%' }} aria-hidden />
      </div>
    </div>
  );
}

export function JsonView({ value, summary = 'Raw JSON', open }: { value: unknown; summary?: string; open?: boolean }) {
  return (
    <details className="json" open={open}>
      <summary>{summary}</summary>
      <pre>{JSON.stringify(value, null, 2)}</pre>
    </details>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

export function KV({ items }: { items: Array<[ReactNode, ReactNode]> }) {
  return (
    <dl className="kv">
      {items.map(([k, v], i) => (
        <div key={i} className="kv-row">
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export function PageHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="page-head">
      <h1>{title}</h1>
      {children && <div className="page-head-actions">{children}</div>}
    </div>
  );
}

export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: readonly T[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={o} type="button" role="radio" aria-checked={value === o} className={value === o ? 'active' : ''} onClick={() => onChange(o)}>
          {o}
        </button>
      ))}
    </div>
  );
}

/**
 * Horizontal scroll container (`.table-wrap`) that shows a "scroll for more columns" hint while content
 * overflows to the right. Tables never widen the page; they scroll inside their card.
 */
export function ScrollBox({ children, style, className }: { children: ReactNode; style?: CSSProperties; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => setMore(el.scrollWidth - el.clientWidth - el.scrollLeft > 4);
    check();
    el.addEventListener('scroll', check, { passive: true });
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(check) : null;
    ro?.observe(el);
    if (el.firstElementChild) ro?.observe(el.firstElementChild);
    return () => {
      el.removeEventListener('scroll', check);
      ro?.disconnect();
    };
  }, []);
  return (
    <div className={`scrollbox ${more ? 'has-more' : ''}`}>
      <div ref={ref} className={`table-wrap ${className ?? ''}`} style={style}>
        {children}
      </div>
      {more && (
        <div className="scroll-hint" aria-hidden>
          scroll for more →
        </div>
      )}
    </div>
  );
}
