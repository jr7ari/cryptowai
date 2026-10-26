'use client';

import { ExName } from '@/components/ExchangeName';
import { useEffect, useMemo, useState } from 'react';
import { CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api } from '@/lib/api';
import { fmtAge, fmtBps, fmtDate, fmtFrac, fmtIndicator, fmtNum, fmtPrice, fmtTs } from '@/lib/format';
import { useNow, usePoll } from '@/lib/hooks';
import type { ChainSource, IndicatorUnit, IndicatorsResponse, OptionChainResponse } from '@/lib/types';
import { AlphaSignals, hasAlpha } from '@/components/alpha';
import { AXIS, ChartBox, GRID, TOOLTIP_STYLE } from '@/components/charts';
import { useEngine } from '@/components/providers';
import { Table } from '@/components/Table';
import { Badge, Card, DataState, Field, JsonView, Kpi, PageHeader, RegimeBadge, Segmented, SignalBadge } from '@/components/ui';

function SourceBadge({ source }: { source: ChainSource }) {
  if (source === 'DERIBIT_REF')
    return (
      <Badge tone="amber" title="Real quotes from Deribit's public API (the engine trades options in PAPER only)">
        DERIBIT LIVE DATA
      </Badge>
    );
  return <Badge tone="green">{source}</Badge>;
}

const UNIT_LABEL: Record<IndicatorUnit, string> = { pct: '%', ratio: 'ratio', score: 'score', num: 'value' };

function OptionsSection({ d }: { d: IndicatorsResponse }) {
  const [expiry, setExpiry] = useState<number | undefined>(undefined);
  const chain = usePoll(d.chain ? `chain:${d.symbol}:${expiry ?? 'auto'}` : null, () => api.chain(d.symbol, expiry), 60_000);
  if (!d.chain) return <p className="muted">No live option chain for {d.symbol} right now (Deribit unreachable or disabled) - option strategies are paused; futures continue.</p>;
  const m = d.chain.metrics;
  return (
    <>
      <div className="row" style={{ marginBottom: 10 }}>
        <span className="muted small">Chain source</span>
        <SourceBadge source={d.chain.source} />
        <span className="muted small">
          {d.chain.contracts} contracts · spot {fmtPrice(d.chain.spot)} · {fmtTs(d.chain.ts)}
        </span>
      </div>
      {d.chain.source === 'DERIBIT_REF' && (
        <div className="note" style={{ marginBottom: 10 }}>
          This chain is <strong>real, live option market data from Deribit&apos;s public API</strong> (bid/ask/mark/IV/OI exactly as quoted). LIVE options are not implemented for the connected exchange, so option trades run in PAPER against these real quotes. If Deribit is unreachable there is no chain and option strategies pause - nothing is ever synthesised.
        </div>
      )}
      <div className="kpis">
        <Kpi label="ATM IV" value={fmtFrac(m.atmIv)} />
        <Kpi label="25d risk reversal" value={fmtFrac(m.riskReversal25d, { sign: true })} tone={m.riskReversal25d !== undefined ? (m.riskReversal25d > 0 ? 'pos' : 'neg') : ''} />
        <Kpi label="25d butterfly" value={fmtFrac(m.butterfly25d)} />
        <Kpi label="Term slope" value={fmtFrac(m.termSlope, { sign: true })} />
        <Kpi label="PCR (OI)" value={fmtNum(m.pcrOpenInterest, 2)} />
        <Kpi label="PCR (volume)" value={fmtNum(m.pcrVolume, 2)} />
        <Kpi label="Max pain" value={fmtNum(m.maxPain, 0)} />
        <Kpi label="Total OI" value={fmtNum(m.totalOpenInterest, 0)} />
      </div>
      <h3>IV smile</h3>
      <DataState data={chain.data} error={chain.error} loading={chain.loading} reload={chain.reload} empty={(c) => !c.contracts.length} emptyTitle="No contracts for this expiry">
        {(c) => <Smile c={c} expiry={expiry} onExpiry={setExpiry} />}
      </DataState>
    </>
  );
}

function Smile({ c, expiry, onExpiry }: { c: OptionChainResponse; expiry: number | undefined; onExpiry: (e: number | undefined) => void }) {
  const calls = useMemo(() => c.contracts.filter((x) => x.type === 'C' && x.iv > 0).sort((a, b) => a.strike - b.strike).map((x) => ({ strike: x.strike, iv: x.iv })), [c]);
  const puts = useMemo(() => c.contracts.filter((x) => x.type === 'P' && x.iv > 0).sort((a, b) => a.strike - b.strike).map((x) => ({ strike: x.strike, iv: x.iv })), [c]);
  const gap = useMemo(() => {
    const byStrike = new Map(puts.map((p) => [p.strike, p.iv]));
    let max = 0;
    let n = 0;
    for (const c of calls) {
      const p = byStrike.get(c.strike);
      if (p === undefined) continue;
      n++;
      max = Math.max(max, Math.abs(c.iv - p));
    }
    return n ? max : undefined;
  }, [calls, puts]);
  return (
    <>
      <div className="row" style={{ marginBottom: 8 }}>
        <Field label="Expiry">
          <select className="input" value={expiry ?? c.selectedExpiry} onChange={(e) => onExpiry(Number(e.target.value))}>
            {c.expiries.map((e) => (
              <option key={e} value={e}>
                {fmtDate(e)} ({Math.max(0, (e - c.ts) / 86_400_000).toFixed(1)}d)
              </option>
            ))}
          </select>
        </Field>
        <SourceBadge source={c.source} />
      </div>
      <ChartBox height={280} label="Implied volatility smile">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart margin={{ top: 22, right: 12, bottom: 0, left: 0 }}>
            <CartesianGrid {...GRID} />
            <XAxis dataKey="strike" type="number" domain={['dataMin', 'dataMax']} tickFormatter={(v: number) => fmtNum(v, 0)} allowDuplicatedCategory={false} {...AXIS} />
            <YAxis domain={['auto', 'auto']} tickFormatter={(v: number) => `${(v * 100).toFixed(0)}%`} width={48} {...AXIS} />
            <Tooltip {...TOOLTIP_STYLE} labelFormatter={(v) => `Strike ${fmtNum(Number(v), 0)}`} formatter={(v, n) => [fmtFrac(Number(v)), String(n)]} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <ReferenceLine x={c.spot} stroke="#94a3b8" strokeDasharray="4 3" label={{ value: 'spot', fill: '#94a3b8', fontSize: 11, position: 'top' }} />
            <Line data={calls} dataKey="iv" name="Calls" stroke="#22c55e" strokeWidth={7} strokeOpacity={0.35} dot={{ r: 4, fill: '#22c55e', stroke: '#22c55e', fillOpacity: 0.5 }} isAnimationActive={false} />
            <Line
              data={puts}
              dataKey="iv"
              name="Puts"
              stroke="#f87171"
              strokeWidth={1.6}
              strokeDasharray="6 4"
              dot={{ r: 2.5, fill: '#10141a', stroke: '#f87171', strokeWidth: 1.5 }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </ChartBox>
      <p className="muted small" style={{ margin: '6px 0 0' }}>
        Implied volatility per strike for the selected expiry. Calls are the wide translucent green band, puts the dashed red line drawn on top. They
        usually coincide because put-call parity forces the same IV at a strike; a visible gap signals stale or illiquid quotes
        {gap !== undefined && <> (largest call/put gap here: {fmtNum(gap * 100, 2)} vol pts)</>}. A smile that rises to the left (lower strikes)
        means downside protection is priced richer than upside.
      </p>
    </>
  );
}

function MarketHeader({ d }: { d: IndicatorsResponse }) {
  const now = useNow(1000);
  const bid = d.topOfBook?.bid;
  const ask = d.topOfBook?.ask;
  const mid = bid !== undefined && ask !== undefined ? (bid + ask) / 2 : undefined;
  const spreadBps = mid ? ((ask! - bid!) / mid) * 10_000 : undefined;
  const fr = d.mark?.fundingRate;
  return (
    <div className="kpis">
      <Kpi label="Last price" value={fmtPrice(d.price?.price)} hint={d.price?.ts ? `${fmtAge(now - d.price.ts)} ago` : 'no trades yet'} />
      <Kpi label="Bid" value={<span className="pos">{fmtPrice(bid)}</span>} hint={d.topOfBook?.ts ? `book ${fmtAge(now - d.topOfBook.ts)} ago` : undefined} />
      <Kpi label="Ask" value={<span className="neg">{fmtPrice(ask)}</span>} hint={`spread ${fmtBps(spreadBps)}`} />
      <Kpi label="Mark" value={fmtPrice(d.mark?.mark)} hint={d.mark?.ts ? `${fmtAge(now - d.mark.ts)} ago` : undefined} />
      <Kpi
        label="Funding (8h)"
        value={fmtFrac(fr, { dp: 4, sign: true })}
        tone={fr === undefined ? '' : fr > 0 ? 'warn' : 'info'}
        hint={fr !== undefined ? `${fmtFrac(fr * 3 * 365, { sign: true })} annualised` : 'not available'}
      />
      {d.mark?.openInterest !== undefined && <Kpi label="Open interest" value={fmtNum(d.mark.openInterest, 0)} />}
    </div>
  );
}

function IndicatorPanel({ d }: { d: IndicatorsResponse }) {
  return (
    <>
      <Card title={`${d.symbol} market`} subtitle={<><ExName /> perpetual: last trade, top of book, mark and funding</>} actions={d.regime ? <RegimeBadge regime={d.regime.primary} confidence={d.regime.confidence} /> : undefined}>
        <MarketHeader d={d} />
      </Card>
      <Card title="Alpha signals" subtitle="How the engine tilts direction, strategy choice and size right now">
        {hasAlpha(d.features) ? <AlphaSignals f={d.features} /> : <p className="muted">No alpha signals yet: they appear after the first decision cycle once enough candles are loaded.</p>}
      </Card>
      <Card title={`${d.symbol} indicators`} subtitle="Values use each indicator's own unit: % (fractions shown as percent), ratio, signed score, or raw value">
        <Table
          rows={d.interpreted}
          rowKey={(r) => r.name}
          emptyTitle="Not enough candles to compute indicators yet"
          columns={[
            { key: 'name', header: 'Indicator' },
            { key: 'value', header: 'Value', align: 'right', render: (r) => <span className="mono" title={r.unit ? UNIT_LABEL[r.unit] : undefined}>{fmtIndicator(r.value, r.unit)}</span> },
            { key: 'signal', header: 'Signal', render: (r) => <SignalBadge signal={r.signal} /> },
            { key: 'note', header: 'Note', render: (r) => <span className="muted">{r.note || '—'}</span>, className: 'wrap' },
          ]}
        />
        <div style={{ marginTop: 10 }}>
          <JsonView value={d.features} summary={`Raw features (${Object.keys(d.features ?? {}).length})`} />
        </div>
      </Card>
      <Card title="Options">
        <OptionsSection key={d.symbol} d={d} />
      </Card>
    </>
  );
}

export default function IndicatorsPage() {
  const { status } = useEngine();
  const symbols = status?.symbols ?? [];
  const [sel, setSel] = useState('');
  useEffect(() => {
    if (!sel && symbols.length) setSel(symbols[0]);
  }, [sel, symbols]);
  const ind = usePoll(sel ? `indicators:${sel}` : null, () => api.indicators(sel), 20_000);

  return (
    <>
      <PageHeader title="Indicators">{symbols.length > 0 && <Segmented label="Symbol" value={sel} options={symbols} onChange={setSel} />}</PageHeader>
      {!sel ? (
        <DataState data={undefined} error={undefined} loading={!status} emptyTitle="Waiting for engine status (symbol list)">
          {() => null}
        </DataState>
      ) : (
        <DataState data={ind.data} error={ind.error} loading={ind.loading} reload={ind.reload}>
          {(d) => <IndicatorPanel d={d} />}
        </DataState>
      )}
    </>
  );
}
