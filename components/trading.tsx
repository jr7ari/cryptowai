'use client';

/** Domain widgets shared between pages (positions table, decision feed, alerts list, exit plan). */
import { useState } from 'react';
import { api } from '@/lib/api';
import { exchangeLabel, positionExchange } from '@/lib/exchange';
import { fmtDuration, fmtMoney, fmtPct, fmtPrice, fmtTs, isNever, pnlClass, humanize, shortId } from '@/lib/format';
import type { AlertRecord, DecisionRecord, ExitPlan, Position } from '@/lib/types';
import { ConfirmDialog } from './Modal';
import { useAction, useEngine } from './providers';
import { Table } from './Table';
import { Badge, EmptyState, RegimeBadge, type BadgeTone } from './ui';

/** Human-readable exit rule parts. Values >= 1e8 are the engine's "never" sentinel and show as "off". */
export function exitPlanParts(plan: ExitPlan, now = Date.now()): Array<{ label: string; value: string; off?: boolean; title?: string }> {
  const left = plan.timeExitAt ? plan.timeExitAt - now : NaN;
  const trailOff = isNever(plan.trailingActivationPct) || isNever(plan.trailingDistancePct);
  const regimeOff = !Number.isFinite(plan.regimeInvalidationConfidence) || plan.regimeInvalidationConfidence > 1;
  const parts: Array<{ label: string; value: string; off?: boolean; title?: string }> = [
    { label: 'SL', value: isNever(plan.stopLossPct) ? 'off' : `-${fmtPct(plan.stopLossPct)}`, off: isNever(plan.stopLossPct), title: 'Stop loss, % of max loss / premium' },
    { label: 'TP', value: isNever(plan.takeProfitPct) ? 'off' : `+${fmtPct(plan.takeProfitPct)}`, off: isNever(plan.takeProfitPct), title: 'Take profit, % of max loss / premium' },
    {
      label: 'Trail',
      value: trailOff ? 'off' : `${fmtPct(plan.trailingActivationPct)} → give back ${fmtPct(plan.trailingDistancePct)}`,
      off: trailOff,
      title: 'Trailing stop: activates at the first %, then exits after giving back the second %',
    },
    { label: 'Time', value: Number.isFinite(left) ? (left > 0 ? fmtDuration(left) : 'due') : '—', title: plan.timeExitAt ? `Time exit at ${fmtTs(plan.timeExitAt)}` : undefined },
  ];
  if (plan.signalExit) {
    const f = plan.signalExit.feature;
    const bits: string[] = [];
    if (plan.signalExit.below !== undefined && Number.isFinite(plan.signalExit.below)) bits.push(`${f} < ${plan.signalExit.below}`);
    if (plan.signalExit.above !== undefined && Number.isFinite(plan.signalExit.above)) bits.push(`${f} > ${plan.signalExit.above}`);
    parts.push({
      label: 'Signal',
      value: bits.length ? `exit when ${bits.join(' or ')}` : `exit on ${f}`,
      title: 'Signal-based exit (longs cover below the threshold, shorts cover above it)',
    });
  }
  parts.push({
    label: 'Regime flip',
    value: regimeOff ? 'off' : `≥ ${(plan.regimeInvalidationConfidence * 100).toFixed(0)}% conf.`,
    off: regimeOff,
    title: 'Exit when the regime flips against the position with at least this confidence',
  });
  return parts;
}

export function ExitPlanCell({ plan, now }: { plan: ExitPlan | undefined; now?: number }) {
  if (!plan) return <span className="muted">—</span>;
  return (
    <span className="exitplan small">
      {exitPlanParts(plan, now).map((p) => (
        <span key={p.label} className="exitplan-part" title={p.title}>
          <span className="muted">{p.label}</span> <span className={`mono ${p.off ? 'muted' : ''}`}>{p.value}</span>
        </span>
      ))}
    </span>
  );
}

const ACTION_TONE: Record<DecisionRecord['action'], BadgeTone> = { OPEN: 'green', NO_TRADE: 'grey', BLOCKED: 'amber', HOLDING: 'blue' };
export function ActionBadge({ action }: { action: DecisionRecord['action'] }) {
  return <Badge tone={ACTION_TONE[action] ?? 'grey'}>{action.replace('_', ' ')}</Badge>;
}

const ALERT_TONE: Record<AlertRecord['level'], BadgeTone> = { info: 'blue', warn: 'amber', error: 'red', critical: 'red' };
export function AlertLevelBadge({ level }: { level: AlertRecord['level'] }) {
  return (
    <Badge tone={ALERT_TONE[level] ?? 'grey'} pulse={level === 'critical'}>
      {level.toUpperCase()}
    </Badge>
  );
}

export function PositionsTable({ positions, onChanged }: { positions: Position[]; onChanged?: () => void }) {
  const [closing, setClosing] = useState<Position | null>(null);
  const { run, busy } = useAction();
  const { status } = useEngine();
  const connected = status?.exchange ?? 'coindcx';
  const rows = [...positions].sort((a, b) => {
    const ap = positionExchange(a) === connected ? 0 : 1;
    const bp = positionExchange(b) === connected ? 0 : 1;
    return ap - bp || b.openedAt - a.openedAt;
  });
  return (
    <>
      <Table
        rows={rows}
        rowKey={(p) => p.id}
        emptyTitle="No open positions"
        columns={[
          { key: 'openedAt', header: 'Opened', render: (p) => fmtTs(p.openedAt) },
          { key: 'mode', header: 'Mode', render: (p) => <Badge tone={p.mode === 'LIVE' ? 'red' : 'blue'}>{p.mode}</Badge> },
          {
            key: 'underlying',
            header: 'Underlying',
            render: (p) => {
              const parked = positionExchange(p) !== connected;
              return (
                <span>
                  <span className="mono">{p.underlying}</span>{' '}
                  {parked ? (
                    <Badge tone="amber" title={`Opened on ${exchangeLabel(positionExchange(p))}. Not marked or exited while connected to ${exchangeLabel(connected)}. Restart on that exchange to close it.`}>
                      Parked · {exchangeLabel(positionExchange(p))}
                    </Badge>
                  ) : null}
                </span>
              );
            },
          },
          { key: 'strategy', header: 'Strategy', render: (p) => humanize(p.strategy) },
          { key: 'status', header: 'Status', render: (p) => <Badge tone={p.status === 'OPEN' ? 'green' : 'amber'}>{p.status}</Badge> },
          { key: 'regimeAtEntry', header: 'Regime', render: (p) => <RegimeBadge regime={p.regimeAtEntry} confidence={p.regimeConfidence} /> },
          {
            key: 'entryCost',
            header: 'Entry',
            align: 'right',
            sort: (p) => p.legs.find((l) => l.kind === 'FUTURE')?.entryPrice ?? p.entryCost,
            render: (p) => {
              const fut = p.legs.find((l) => l.kind === 'FUTURE') ?? p.legs[0];
              const px = fut?.entryPrice;
              if (px && px > 0) {
                return (
                  <span className="mono" title={`signed notional ${fmtMoney(p.entryCost)} (accounting, not a price)`}>
                    {fmtPrice(px)}
                    {fut.side === 'SELL' ? <span className="muted small"> short</span> : null}
                  </span>
                );
              }
              return <span className="mono">{fmtMoney(p.entryCost)}</span>;
            },
          },
          {
            key: 'lastMarkPnl',
            header: 'Mark P&L',
            align: 'right',
            render: (p) => (
              <span className={`mono ${pnlClass(p.lastMarkPnl)}`} title={p.lastMarkAt ? `marked ${fmtTs(p.lastMarkAt)}` : undefined}>
                {fmtMoney(p.lastMarkPnl, { sign: true })}
                {p.maxLoss > 0 && p.lastMarkPnl !== undefined && <span className="muted small"> ({fmtPct((p.lastMarkPnl / p.maxLoss) * 100, { sign: true, dp: 0 })} of risk)</span>}
              </span>
            ),
          },
          { key: 'maxLoss', header: 'Max loss', align: 'right', render: (p) => <span className="mono neg">{fmtMoney(p.maxLoss)}</span> },
          { key: 'exit', header: 'Exit plan', sortable: false, className: 'wrap', render: (p) => <ExitPlanCell plan={p.exitPlan} /> },
          {
            key: 'actions',
            header: '',
            sortable: false,
            render: (p) => {
              const parked = positionExchange(p) !== connected;
              return (
                <button
                  type="button"
                  className="btn btn-sm btn-warn"
                  disabled={parked || p.status === 'CLOSING' || !!busy}
                  title={parked ? `Restart connected to ${exchangeLabel(positionExchange(p))} to close this position` : undefined}
                  onClick={(e) => {
                    e.stopPropagation();
                    setClosing(p);
                  }}
                >
                  Close
                </button>
              );
            },
          },
        ]}
      />
      <ConfirmDialog
        open={!!closing}
        onClose={() => setClosing(null)}
        danger={closing?.mode === 'LIVE'}
        busy={!!busy}
        title={`Close position ${shortId(closing?.id)}`}
        confirmLabel="Close at market"
        onConfirm={async () => {
          if (!closing) return;
          const r = await run('Close position', () => api.closePosition(closing.id), () => `Close requested for ${closing.strategy} on ${closing.underlying}`);
          if (r !== undefined) {
            setClosing(null);
            onChanged?.();
          }
        }}
      >
        {closing && (
          <p>
            Close <strong>{humanize(closing.strategy)}</strong> on <span className="mono">{closing.underlying}</span> ({closing.mode}) at market. Current mark P&amp;L:{' '}
            <span className={pnlClass(closing.lastMarkPnl)}>{fmtMoney(closing.lastMarkPnl, { sign: true })}</span>.
            {closing.mode === 'LIVE' && ' This sends real orders and requires an operator token.'}
          </p>
        )}
      </ConfirmDialog>
    </>
  );
}

export function DecisionFeed({ decisions, onSelect, max = 20 }: { decisions: DecisionRecord[]; onSelect?: (d: DecisionRecord) => void; max?: number }) {
  if (!decisions.length) return <EmptyState title="No decisions yet">Decisions appear here as the engine evaluates each closed bar.</EmptyState>;
  const collapsed: Array<DecisionRecord & { repeats?: number }> = [];
  const skipIdx = new Map<string, number>();
  for (const d of decisions) {
    if (d.action === 'OPEN') {
      collapsed.push(d);
      continue;
    }
    const key = `${d.symbol}|${d.action}|${d.selected ?? ''}`;
    const at = skipIdx.get(key);
    if (at !== undefined) {
      collapsed[at].repeats = (collapsed[at].repeats ?? 1) + 1;
      continue;
    }
    skipIdx.set(key, collapsed.length);
    collapsed.push({ ...d, repeats: 1 });
  }
  return (
    <ul className="feed">
      {collapsed.slice(0, max).map((d) => (
        <li key={d.id}>
          <div className="feed-main">
            <div className="row">
              <ActionBadge action={d.action} />
              <span className="mono">{d.symbol}</span>
              <RegimeBadge regime={d.regime?.primary} confidence={d.regime?.confidence} />
              {d.selected && <Badge tone="purple">{humanize(d.selected)}</Badge>}
              <span className="spacer" />
              <span className="feed-meta">
                {fmtTs(d.ts)} · {d.mode}
                {d.repeats && d.repeats > 1 ? ` · ×${d.repeats}` : ''}
              </span>
            </div>
            <div className="feed-text muted small" style={{ marginTop: 4 }}>
              {d.rationale}
            </div>
          </div>
          {onSelect && (
            <button type="button" className="btn btn-sm" onClick={() => onSelect(d)} aria-label={`Open decision ${d.id}`}>
              Details
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}

export function AlertsList({ alerts, onChanged, max = 15 }: { alerts: AlertRecord[]; onChanged?: () => void; max?: number }) {
  const { run, busy } = useAction();
  if (!alerts.length) return <EmptyState title="No alerts" />;
  return (
    <ul className="feed">
      {alerts.slice(0, max).map((a) => (
        <li key={a.id} style={a.acknowledged ? { opacity: 0.55 } : undefined}>
          <div className="feed-main">
            <div className="row">
              <AlertLevelBadge level={a.level} />
              <span className="mono small">{a.code}</span>
              <span className="spacer" />
              <span className="feed-meta">{fmtTs(a.ts)}</span>
            </div>
            <div className="feed-text" style={{ marginTop: 4 }}>
              {a.message}
            </div>
          </div>
          {!a.acknowledged && (
            <button
              type="button"
              className="btn btn-sm"
              disabled={!!busy}
              onClick={async () => {
                const r = await run('Acknowledge alert', () => api.ackAlert(a.id), () => null);
                if (r) onChanged?.();
              }}
            >
              Ack
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}
