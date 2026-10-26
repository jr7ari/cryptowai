'use client';

import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { fmtMoney, fmtPct, pnlClass } from '@/lib/format';
import { usePoll } from '@/lib/hooks';
import type { AccountStatus, DecisionRecord, Mode } from '@/lib/types';
import { EquityChart } from '@/components/charts';
import { AlphaSignals, hasAlpha } from '@/components/alpha';
import Link from 'next/link';
import { DecisionDrawer } from '@/components/DecisionDrawer';
import { useEngine } from '@/components/providers';
import { AlertsList, DecisionFeed, PositionsTable } from '@/components/trading';
import { Badge, Card, DataState, EmptyState, Kpi, PageHeader, Segmented } from '@/components/ui';
import { exchangeLabel, positionExchange } from '@/lib/exchange';

const MODES = ['PAPER', 'LIVE'] as const;
const DAYS = ['1', '7', '30', '90'] as const;

function AccountCard({ mode, a, active }: { mode: Mode; a: AccountStatus | undefined; active: boolean }) {
  const dayPct = a && a.dayStartEquity > 0 ? ((a.equity - a.dayStartEquity) / a.dayStartEquity) * 100 : undefined;
  return (
    <Card
      title={`${mode} account`}
      className={active && mode === 'LIVE' ? 'card-danger' : ''}
      actions={active ? <Badge tone={mode === 'LIVE' ? 'red' : 'blue'}>ACTIVE</Badge> : <Badge>idle</Badge>}
    >
      {!a ? (
        <EmptyState title="No account data" />
      ) : (
        <>
          <div className="kpis">
            <Kpi label="Equity" value={fmtMoney(a.equity)} />
            <Kpi label="Cash" value={fmtMoney(a.cash)} />
            <Kpi label="Unrealized" value={fmtMoney(a.unrealizedPnl, { sign: true })} tone={pnlClass(a.unrealizedPnl) as 'pos' | 'neg' | ''} />
            <Kpi label="Realized today" value={fmtMoney(a.realizedPnlToday, { sign: true })} tone={pnlClass(a.realizedPnlToday) as 'pos' | 'neg' | ''} />
            <Kpi label="Day P&L" value={fmtPct(dayPct, { sign: true })} tone={pnlClass(dayPct) as 'pos' | 'neg' | ''} />
            <Kpi label="Drawdown" value={fmtPct(a.drawdownPct)} tone={a.drawdownPct > 5 ? 'warn' : ''} />
            <Kpi label="Margin in use" value={fmtMoney(a.marginInUse)} />
            <Kpi label="Open positions" value={a.openPositions} />
            <Kpi label="Consec. losses" value={a.consecutiveLosses} tone={a.consecutiveLosses >= 3 ? 'warn' : ''} />
            <Kpi label="Fees paid" value={fmtMoney(a.totalFees)} />
          </div>
          <p className="muted small" style={{ margin: '8px 0 0' }}>
            Equity = cash + unrealized (open mark-to-market). Position Mark P&amp;L is a close-out estimate after remaining exit fees and is not part of this identity.
          </p>
        </>
      )}
    </Card>
  );
}

function AlphaCard({ symbols, latest }: { symbols: string[]; latest: DecisionRecord[] }) {
  const [sel, setSel] = useState('');
  useEffect(() => {
    if ((!sel || !symbols.includes(sel)) && symbols.length) setSel(symbols[0]);
  }, [sel, symbols]);
  const ind = usePoll(sel ? `indicators:${sel}` : null, () => api.indicators(sel), 30_000);
  const fromDec = latest.find((d) => d.symbol === sel)?.snapshot?.features;
  return (
    <Card
      title="Alpha signals"
      subtitle={
        <>
          Directional drift, trend and volatility-premium signals behind the engine&apos;s choices · <Link href="/indicators">all indicators →</Link>
        </>
      }
      actions={symbols.length > 1 ? <Segmented label="Symbol" value={sel} options={symbols} onChange={setSel} /> : undefined}
    >
      <DataState data={ind.data} error={ind.error} loading={ind.loading || !sel} reload={ind.reload}>
        {(d) => {
          const f = { ...d.features };
          if (fromDec) {
            for (const k of ['alphaDrift', 'alphaRegime', 'alphaMomentum', 'alphaFunding', 'vrpScore', 'volTargetScale', 'forecastVol'] as const) {
              const v = fromDec[k];
              if (typeof v === 'number' && Number.isFinite(v)) f[k] = v;
            }
          }
          return hasAlpha(f) ? (
            <AlphaSignals f={f} compact />
          ) : (
            <EmptyState title="No alpha signals yet">They appear after the first decision cycle once enough candles are loaded.</EmptyState>
          );
        }}
      </DataState>
    </Card>
  );
}

export default function OverviewPage() {
  const { status, liveDecisions, positionTick, alertTick } = useEngine();
  const [eqMode, setEqMode] = useState<Mode>('PAPER');
  const [days, setDays] = useState<(typeof DAYS)[number]>('30');
  const [openDecision, setOpenDecision] = useState<string | null>(null);

  useEffect(() => {
    if (status?.mode) setEqMode(status.mode);
  }, [status?.mode]);

  const equity = usePoll(`equity:${eqMode}:${days}`, () => api.equity(eqMode, Number(days)), 60_000);
  const positions = usePoll('positions:open', () => api.positions({ status: 'open' }), 10_000);
  const alerts = usePoll('alerts', () => api.alerts(30), 30_000);
  const decisions = usePoll('decisions:recent', () => api.decisions({ limit: 20 }), 60_000);

  useEffect(() => {
    if (positionTick) void positions.reload();
  }, [positionTick]);
  useEffect(() => {
    if (alertTick) void alerts.reload();
  }, [alertTick]);

  const feed = useMemo(() => {
    const m = new Map<string, DecisionRecord>();
    for (const d of [...liveDecisions, ...(decisions.data ?? [])]) if (!m.has(d.id)) m.set(d.id, d);
    return [...m.values()].sort((a, b) => b.ts - a.ts).slice(0, 20);
  }, [liveDecisions, decisions.data]);

  const connected = status?.exchange ?? 'coindcx';
  const activePositions = (positions.data ?? []).filter((p) => positionExchange(p) === connected);
  const parkedPositions = (positions.data ?? []).filter((p) => positionExchange(p) !== connected);
  const parkedOn = parkedPositions.length ? exchangeLabel(positionExchange(parkedPositions[0])) : '';

  return (
    <>
      <PageHeader title="Overview" />
      <Card
        title="Equity curve"
        actions={
          <>
            <Segmented label="Account" value={eqMode} options={MODES} onChange={setEqMode} />
            <Segmented label="Days" value={days} options={DAYS} onChange={setDays} />
          </>
        }
      >
        <DataState data={equity.data} error={equity.error} loading={equity.loading} reload={equity.reload} empty={(d) => d.length < 2} emptyTitle="Not enough equity snapshots yet">
          {(d) => <EquityChart points={d.map((e) => ({ ts: e.ts, equity: e.equity }))} />}
        </DataState>
      </Card>

      <div className="grid grid-2">
        <AccountCard mode="PAPER" a={status?.accounts.PAPER} active={status?.mode === 'PAPER'} />
        <AccountCard mode="LIVE" a={status?.accounts.LIVE} active={status?.mode === 'LIVE'} />
      </div>

      <AlphaCard symbols={status?.symbols ?? []} latest={feed} />

      <Card title="Open positions" subtitle="On this exchange only. Mark P&L refreshes with the position monitor" actions={<span className="muted small">{activePositions.length} open</span>}>
        <DataState data={positions.data} error={positions.error} loading={positions.loading} reload={positions.reload} empty={() => activePositions.length === 0} emptyTitle="No open positions on this exchange">
          {() => <PositionsTable positions={activePositions} onChanged={positions.reload} />}
        </DataState>
      </Card>

      {parkedPositions.length > 0 && (
        <Card
          title={`Parked on ${parkedOn}`}
          subtitle={`These were opened while connected to ${parkedOn}. They are not marked, exited, or counted in Delta risk. Restart with \`npm run dev -- --exchange ${positionExchange(parkedPositions[0])}\` to close them.`}
          actions={<span className="muted small">{parkedPositions.length} parked</span>}
        >
          <PositionsTable positions={parkedPositions} onChanged={positions.reload} />
        </Card>
      )}

      <div className="grid grid-2">
        <Card title="Latest decisions" actions={<span className="muted small">live via stream</span>}>
          <DataState data={decisions.data ?? (liveDecisions.length ? [] : undefined)} error={decisions.error} loading={decisions.loading} reload={decisions.reload}>
            {() => <DecisionFeed decisions={feed} onSelect={(d) => setOpenDecision(d.id)} />}
          </DataState>
        </Card>
        <Card title="Recent alerts" actions={<span className="muted small">{alerts.data?.filter((a) => !a.acknowledged).length ?? 0} unacknowledged</span>}>
          <DataState data={alerts.data} error={alerts.error} loading={alerts.loading} reload={alerts.reload}>
            {(d) => <AlertsList alerts={d} onChanged={alerts.reload} />}
          </DataState>
        </Card>
      </div>
      <DecisionDrawer id={openDecision} onClose={() => setOpenDecision(null)} />
    </>
  );
}
