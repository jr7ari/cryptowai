'use client';

import { useEffect, useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, ComposedChart, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api } from '@/lib/api';
import { fmtAxisTime, fmtFrac, fmtNum, fmtTs, humanize } from '@/lib/format';
import { usePoll } from '@/lib/hooks';
import { REGIME_COLORS, regimeColor, regimeIndex, regimeLabel } from '@/lib/regimes';
import { REGIMES, TIMEFRAMES, type RegimeClassification, type RegimeName, type Timeframe } from '@/lib/types';
import { AXIS, ChartBox, GRID, Gauge, TOOLTIP_STYLE } from '@/components/charts';
import { useEngine } from '@/components/providers';
import { Badge, Card, DataState, EmptyState, PageHeader, RegimeBadge, Segmented } from '@/components/ui';

function ProbabilityChart({ r }: { r: RegimeClassification }) {
  const data = REGIMES.map((k) => ({ name: k, label: regimeLabel(k), prob: r.probabilities?.[k] ?? 0, score: r.scores?.[k] ?? 0 })).sort((a, b) => b.prob - a.prob);
  return (
    <ChartBox height={250} label="Regime probabilities">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 12, bottom: 0, left: 0 }}>
          <CartesianGrid {...GRID} horizontal={false} />
          <XAxis type="number" domain={[0, 1]} tickFormatter={(v: number) => `${Math.round(v * 100)}%`} {...AXIS} />
          <YAxis type="category" dataKey="label" width={92} {...AXIS} interval={0} />
          <Tooltip
            {...TOOLTIP_STYLE}
            cursor={{ fill: 'rgba(255,255,255,0.04)' }}
            formatter={(v, n) => [n === 'prob' ? fmtFrac(Number(v)) : fmtNum(Number(v), 3), n === 'prob' ? 'Probability' : 'Raw score']}
          />
          <Bar dataKey="prob" isAnimationActive={false} radius={[0, 3, 3, 0]}>
            {data.map((d) => (
              <Cell key={d.name} fill={REGIME_COLORS[d.name]} fillOpacity={d.name === r.primary ? 1 : 0.55} />
            ))}
          </Bar>
          <Bar dataKey="score" isAnimationActive={false} fill="#64748b" fillOpacity={0.35} barSize={4} />
        </BarChart>
      </ResponsiveContainer>
    </ChartBox>
  );
}

function RegimeCard({ symbol, r }: { symbol: string; r: RegimeClassification | null }) {
  if (!r)
    return (
      <Card title={symbol}>
        <EmptyState title="No classification yet">The engine classifies on each decision cycle.</EmptyState>
      </Card>
    );
  const color = regimeColor(r.primary);
  const alternatives = REGIMES.filter((k) => k !== r.primary)
    .map((k) => ({ k, p: r.probabilities?.[k] ?? 0 }))
    .sort((a, b) => b.p - a.p)
    .slice(0, 3);
  return (
    <Card title={symbol} subtitle={`classified ${fmtTs(r.ts)} · model ${r.modelVersion}`} actions={r.sticky ? <Badge tone="amber" title="Hysteresis kept the previous regime">STICKY</Badge> : undefined}>
      <div className="regime-head">
        <Gauge value={r.confidence} color={color} />
        <div className="stack" style={{ gap: 6 }}>
          <div style={{ fontSize: 18, fontWeight: 700, color }}>{humanize(r.primary)}</div>
          <div className="row">
            <Badge tone={r.direction === 'BULL' ? 'green' : r.direction === 'BEAR' ? 'red' : 'grey'}>{r.direction}</Badge>
            <Badge tone={r.volState === 'HIGH' ? 'amber' : r.volState === 'LOW' ? 'blue' : 'grey'}>VOL {r.volState}</Badge>
          </div>
        </div>
      </div>
      <ProbabilityChart r={r} />
      <h3>Evidence for {regimeLabel(r.primary)}</h3>
      {(r.evidence?.[r.primary] ?? []).length ? (
        <ul className="bullets">
          {r.evidence[r.primary].map((e, i) => (
            <li key={i}>{e}</li>
          ))}
        </ul>
      ) : (
        <p className="muted small">No evidence recorded.</p>
      )}
      <h3>Top alternatives</h3>
      {alternatives.map(({ k, p }) => (
        <div key={k} style={{ marginBottom: 6 }}>
          <div className="row">
            <RegimeBadge regime={k} />
            <span className="muted small">p={fmtFrac(p)}</span>
          </div>
          {(r.evidence?.[k] ?? []).length > 0 && (
            <ul className="bullets">
              {r.evidence[k].slice(0, 4).map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </Card>
  );
}

function RegimeHistory({ symbol }: { symbol: string }) {
  const h = usePoll(`regime-history:${symbol}`, () => api.regimeHistory(symbol, 300), 60_000);
  const rows = useMemo(
    () =>
      [...(h.data ?? [])]
        .sort((a, b) => a.ts - b.ts)
        .map((r) => ({ ts: r.ts, idx: regimeIndex(r.primary), confidence: r.confidence, regime: r.primary })),
    [h.data],
  );
  const segments = useMemo(() => {
    if (rows.length < 2) return [];
    const total = rows[rows.length - 1].ts - rows[0].ts || 1;
    const segs: Array<{ regime: RegimeName; from: number; to: number; w: number }> = [];
    for (let i = 0; i < rows.length; i++) {
      const to = rows[i + 1]?.ts ?? rows[i].ts + total / rows.length;
      const last = segs[segs.length - 1];
      if (last && last.regime === rows[i].regime) {
        last.to = to;
        last.w = (last.to - last.from) / total;
      } else segs.push({ regime: rows[i].regime, from: rows[i].ts, to, w: (to - rows[i].ts) / total });
    }
    return segs;
  }, [rows]);
  const present = [...new Set(rows.map((r) => r.regime))];

  return (
    <DataState data={h.data} error={h.error} loading={h.loading} reload={h.reload} empty={(d) => d.length === 0} emptyTitle="No regime history yet">
      {() => (
        <>
          <div className="band" aria-label="Regime timeline band">
            {segments.map((s, i) => (
              <span key={i} style={{ width: `${s.w * 100}%`, background: REGIME_COLORS[s.regime] }} title={`${regimeLabel(s.regime)}: ${fmtTs(s.from)} → ${fmtTs(s.to)}`} />
            ))}
          </div>
          <div className="legend">
            {present.map((r) => (
              <span key={r}>
                <i style={{ background: REGIME_COLORS[r] }} />
                {regimeLabel(r)}
              </span>
            ))}
          </div>
          <ChartBox height={280} label="Regime and confidence over time">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={rows} margin={{ top: 12, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid {...GRID} />
                <XAxis dataKey="ts" type="number" scale="time" domain={['dataMin', 'dataMax']} tickFormatter={fmtAxisTime} minTickGap={40} {...AXIS} />
                <YAxis
                  yAxisId="r"
                  type="number"
                  domain={[0, REGIMES.length - 1]}
                  ticks={REGIMES.map((_, i) => i)}
                  tickFormatter={(v: number) => regimeLabel(REGIMES[v])}
                  width={92}
                  {...AXIS}
                />
                <YAxis yAxisId="c" orientation="right" domain={[0, 1]} tickFormatter={(v: number) => `${Math.round(v * 100)}%`} width={40} {...AXIS} />
                <Tooltip
                  {...TOOLTIP_STYLE}
                  labelFormatter={(v) => fmtTs(Number(v))}
                  formatter={(v, n) => (n === 'idx' ? [regimeLabel(REGIMES[Number(v)]), 'Regime'] : [fmtFrac(Number(v)), 'Confidence'])}
                />
                <Line yAxisId="r" type="stepAfter" dataKey="idx" stroke="#cbd5e1" strokeWidth={1.5} dot={false} isAnimationActive={false} />
                <Line yAxisId="c" type="monotone" dataKey="confidence" stroke="#f59e0b" strokeWidth={1.2} strokeDasharray="4 3" dot={false} isAnimationActive={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </ChartBox>
        </>
      )}
    </DataState>
  );
}

function CandlesChart({ symbol, tf }: { symbol: string; tf: Timeframe }) {
  const c = usePoll(`candles:${symbol}:${tf}`, () => api.candles(symbol, tf, 300), 60_000);
  return (
    <DataState data={c.data} error={c.error} loading={c.loading} reload={c.reload} empty={(d) => d.length < 2} emptyTitle="No candles available">
      {(d) => (
        <ChartBox height={220} label={`${symbol} close prices`}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={d} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid {...GRID} vertical={false} />
              <XAxis dataKey="t" type="number" scale="time" domain={['dataMin', 'dataMax']} tickFormatter={fmtAxisTime} minTickGap={40} {...AXIS} />
              <YAxis domain={['auto', 'auto']} width={70} tickFormatter={(v: number) => fmtNum(v, v > 100 ? 0 : 2)} {...AXIS} />
              <Tooltip {...TOOLTIP_STYLE} labelFormatter={(v) => fmtTs(Number(v))} formatter={(v) => [fmtNum(Number(v), 2), 'Close']} />
              <Line type="monotone" dataKey="c" stroke="#60a5fa" strokeWidth={1.4} dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </ChartBox>
      )}
    </DataState>
  );
}

export default function RegimesPage() {
  const { status } = useEngine();
  const regimes = usePoll('regimes', api.regimes, 15_000);
  const symbols = status?.symbols ?? Object.keys(regimes.data ?? {});
  const [sel, setSel] = useState<string>('');
  const [tf, setTf] = useState<Timeframe>('1h');
  useEffect(() => {
    if (!sel && symbols.length) setSel(symbols[0]);
  }, [sel, symbols]);

  return (
    <>
      <PageHeader title="Regimes" />
      <DataState data={regimes.data} error={regimes.error} loading={regimes.loading} reload={regimes.reload} empty={(d) => !Object.keys(d).length} emptyTitle="No symbols configured">
        {(d) => (
          <div className="grid grid-auto">
            {Object.entries(d).map(([s, r]) => (
              <RegimeCard key={s} symbol={s} r={r} />
            ))}
          </div>
        )}
      </DataState>
      {sel && (
        <>
          <Card
            title="Regime history"
            actions={
              symbols.length > 1 ? (
                <Segmented label="Symbol" value={sel} options={symbols} onChange={setSel} />
              ) : (
                <span className="mono">{sel}</span>
              )
            }
          >
            <RegimeHistory symbol={sel} />
          </Card>
          <Card title={`${sel} price`} actions={<Segmented label="Timeframe" value={tf} options={status?.timeframes?.length ? status.timeframes : TIMEFRAMES} onChange={setTf} />}>
            <CandlesChart symbol={sel} tf={tf} />
          </Card>
        </>
      )}
    </>
  );
}
