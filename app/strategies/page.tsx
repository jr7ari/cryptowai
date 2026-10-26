'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api } from '@/lib/api';
import { fmtFrac, fmtMoney, fmtNum, fmtPct, fmtR, humanize, pnlClass } from '@/lib/format';
import { usePoll } from '@/lib/hooks';
import { divergingColor, regimeLabel, sequentialColor } from '@/lib/regimes';
import { REGIMES, STRATEGIES, type Mode, type PerfMetrics, type StrategiesResponse, type StrategyInfo, type StrategyName } from '@/lib/types';
import { AXIS, ChartBox, GRID, TOOLTIP_STYLE } from '@/components/charts';
import { Table, type Column } from '@/components/Table';
import { Badge, Card, DataState, EmptyState, Kpi, PageHeader, RegimeBadge, ScrollBox, Segmented } from '@/components/ui';

type Row = PerfMetrics & { key: string };

const toRows = (o: Record<string, PerfMetrics> | undefined): Row[] => Object.entries(o ?? {}).map(([key, m]) => ({ ...m, key }));

function perfColumns(keyHeader: string, renderKey?: (k: string) => ReactNode): Column<Row>[] {
  return [
    { key: 'key', header: keyHeader, render: (r) => (renderKey ? renderKey(r.key) : r.key) },
    { key: 'trades', header: 'Trades', align: 'right', render: (r) => r.trades },
    { key: 'winRate', header: 'Win rate', align: 'right', render: (r) => fmtFrac(r.winRate) },
    { key: 'expectancyR', header: 'Expectancy', align: 'right', render: (r) => <span className={pnlClass(r.expectancyR)}>{fmtR(r.expectancyR)}</span> },
    { key: 'profitFactor', header: 'PF', align: 'right', render: (r) => (r.profitFactor === null ? '∞' : fmtNum(r.profitFactor, 2)) },
    { key: 'totalPnl', header: 'Total P&L', align: 'right', render: (r) => <span className={pnlClass(r.totalPnl)}>{fmtMoney(r.totalPnl, { sign: true })}</span> },
    { key: 'maxDrawdownPct', header: 'Max DD', align: 'right', render: (r) => fmtPct(r.maxDrawdownPct) },
    { key: 'totalFees', header: 'Fees', align: 'right', render: (r) => fmtMoney(r.totalFees) },
    { key: 'avgHoldHours', header: 'Avg hold', align: 'right', render: (r) => `${fmtNum(r.avgHoldHours, 1)}h` },
  ];
}

function ExpectancyBars({ rows, label }: { rows: Row[]; label: (k: string) => string }) {
  const data = [...rows].sort((a, b) => b.expectancyR - a.expectancyR).map((r) => ({ name: label(r.key), v: r.expectancyR, n: r.trades }));
  if (!data.length) return null;
  return (
    <ChartBox height={Math.max(160, data.length * 26 + 30)} label="Expectancy (R) bar chart">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 16, bottom: 0, left: 0 }}>
          <CartesianGrid {...GRID} horizontal={false} />
          <XAxis type="number" tickFormatter={(v: number) => v.toFixed(2)} {...AXIS} />
          <YAxis type="category" dataKey="name" width={130} interval={0} {...AXIS} />
          <ReferenceLine x={0} stroke="#475569" />
          <Tooltip {...TOOLTIP_STYLE} cursor={{ fill: 'rgba(255,255,255,0.04)' }} formatter={(v) => [fmtR(Number(v)), 'Expectancy']} />
          <Bar dataKey="v" isAnimationActive={false} radius={[0, 3, 3, 0]}>
            {data.map((d, i) => (
              <Cell key={i} fill={d.v >= 0 ? '#22c55e' : '#ef4444'} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartBox>
  );
}

function RegimeStrategyHeatmap({ data }: { data: Record<string, PerfMetrics> }) {
  const cells = new Map<string, PerfMetrics>(Object.entries(data));
  const strategies = STRATEGIES.filter((s) => [...cells.keys()].some((k) => k.endsWith(`|${s}`)));
  const regimes = REGIMES.filter((r) => [...cells.keys()].some((k) => k.startsWith(`${r}|`)));
  if (!strategies.length) return <EmptyState title="No closed trades yet" />;
  const max = Math.max(0.05, ...[...cells.values()].map((m) => Math.abs(m.expectancyR)));
  return (
    <ScrollBox>
      <table className="table dense heatmap">
        <caption className="sr-only">Expectancy in R by regime and strategy</caption>
        <thead>
          <tr>
            <th scope="col">Regime \ Strategy</th>
            {strategies.map((s) => (
              <th key={s} scope="col" className="ta-center" title={s}>
                {humanize(s)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {regimes.map((r) => (
            <tr key={r}>
              <th scope="row" className="rowhead">
                <RegimeBadge regime={r} />
              </th>
              {strategies.map((s) => {
                const m = cells.get(`${r}|${s}`);
                return (
                  <td
                    key={s}
                    className="cell"
                    style={{ background: m ? divergingColor(m.expectancyR, max) : undefined }}
                    title={m ? `${regimeLabel(r)} × ${s}: ${fmtR(m.expectancyR)} over ${m.trades} trades, win ${fmtFrac(m.winRate)}` : 'no trades'}
                  >
                    {m ? (
                      <>
                        {m.expectancyR.toFixed(2)}
                        <div className="muted" style={{ fontSize: 10 }}>
                          n={m.trades}
                        </div>
                      </>
                    ) : (
                      <span className="muted">·</span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </ScrollBox>
  );
}

const PLAIN_FUTURES: StrategyName[] = ['FUTURES_LONG', 'FUTURES_SHORT', 'FUTURES_CARRY', 'FUTURES_XSMOM', 'FUTURES_MR'];
const SINGLE_LEG: StrategyName[] = ['LONG_CALL', 'LONG_PUT', 'LONG_STRADDLE', 'LONG_STRANGLE'];

/** Strategy params mean different things per family: options use DTE/deltas, TSMOM reuses them as thresholds. */
function paramCell(s: StrategyInfo, which: 'targetDte' | 'longDelta' | 'shortDelta') {
  const v = s.params?.[which];
  if (v === undefined || PLAIN_FUTURES.includes(s.name)) return <span className="muted" title="Not used by plain futures strategies">—</span>;
  if (s.name === 'FUTURES_DONCHIAN') {
    const map = {
      targetDte: { label: 'horizon', text: `${fmtNum(v, 0)} d`, title: 'EV horizon (days) of the Donchian ensemble' },
      longDelta: { label: 'enter ≥', text: `${fmtNum(v * 100, 0)}%`, title: 'Enter when at least this share of lookbacks (5-360 d) is in a breakout' },
      shortDelta: { label: 'exit <', text: `${fmtNum(v * 100, 0)}%`, title: 'Exit when the share of lookbacks still long falls below this' },
    }[which];
    return (
      <span title={map.title} className="param-alt">
        <span className="muted small">{map.label}</span> {map.text}
      </span>
    );
  }
  if (s.name === 'FUTURES_TSMOM') {
    const map = {
      targetDte: { label: 'hold', text: `${fmtNum(v, 0)} d`, title: 'Maximum holding period (days) of the TSMOM sleeve' },
      longDelta: { label: 'entry >', text: fmtNum(v, 2), title: 'Enter long when the TSMOM score is above this threshold' },
      shortDelta: { label: 'exit <', text: fmtNum(v, 2), title: 'Exit when the TSMOM score falls below this threshold' },
    }[which];
    return (
      <span title={map.title} className="param-alt">
        <span className="muted small">{map.label}</span> {map.text}
      </span>
    );
  }
  if (which === 'shortDelta' && SINGLE_LEG.includes(s.name)) return <span className="muted" title="Single-leg / long-only option structure: no short leg">—</span>;
  return which === 'targetDte' ? `${fmtNum(v, 0)} d` : fmtNum(v, 2);
}

function Catalog({ d }: { d: StrategiesResponse }) {
  return (
    <>
      <Card
        title="Strategy catalog"
        subtitle={
          <>
            {d.modelVersion ? `Params from active PAPER model ${d.modelVersion}` : 'No active PAPER model'} · {d.strategies.length} strategies. Options use DTE and leg deltas;
            Futures tsmom reuses those slots as hold days / entry / exit thresholds on the TSMOM score; plain futures use none of them.
          </>
        }
      >
        <Table
          rows={d.strategies}
          rowKey={(s) => s.name}
          columns={[
            { key: 'name', header: 'Strategy', render: (s) => <strong>{humanize(s.name)}</strong> },
            { key: 'enabled', header: 'Enabled', sort: (s) => (s.params?.enabled ? 1 : 0), render: (s) => (s.params ? <Badge tone={s.params.enabled ? 'green' : 'grey'}>{s.params.enabled ? 'ON' : 'OFF'}</Badge> : '—') },
            { key: 'risk', header: 'Risk type', render: (s) => <Badge tone={s.risk === 'DEFINED' ? 'blue' : 'amber'}>{s.risk === 'DEFINED' ? 'DEFINED' : 'STOP-DEFINED'}</Badge> },
            { key: 'vega', header: 'Vega', render: (s) => <span className={`mono ${s.vega === '+' ? 'pos' : s.vega === '-' ? 'neg' : ''}`}>{s.vega === '0' ? '≈0' : s.vega}</span> },
            { key: 'bias', header: 'Bias' },
            { key: 'targetDte', header: 'DTE', title: 'Target days to expiry (options) · max hold days (TSMOM)', align: 'right', sort: (s) => s.params?.targetDte, render: (s) => paramCell(s, 'targetDte') },
            { key: 'longDelta', header: 'Long Δ', title: 'Long-leg delta (options) · entry threshold (TSMOM)', align: 'right', sort: (s) => s.params?.longDelta, render: (s) => paramCell(s, 'longDelta') },
            { key: 'shortDelta', header: 'Short Δ', title: 'Short-leg delta (options) · exit threshold (TSMOM)', align: 'right', sort: (s) => s.params?.shortDelta, render: (s) => paramCell(s, 'shortDelta') },
            { key: 'leverage', header: 'Lev', align: 'right', sort: (s) => s.params?.leverage, render: (s) => (s.params ? `${fmtNum(s.params.leverage, 1)}×` : '—') },
            { key: 'description', header: 'Description', sortable: false, className: 'wrap', render: (s) => <span className="muted">{s.description}</span> },
          ]}
        />
      </Card>
      <Card title="Regime → strategy affinity" subtitle={`0 = never selected, 1 = strongest preference · ${STRATEGIES.length} strategies`}>
        {d.affinity ? (
          <ScrollBox>
            <table className="table dense heatmap">
              <caption className="sr-only">Affinity matrix</caption>
              <thead>
                <tr>
                  <th scope="col">Regime</th>
                  {STRATEGIES.map((s) => (
                    <th key={s} scope="col" className="ta-center" title={s}>
                      {humanize(s)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(d.regimes?.length ? d.regimes : REGIMES).map((r) => (
                  <tr key={r}>
                    <th scope="row" className="rowhead">
                      <RegimeBadge regime={r} />
                    </th>
                    {STRATEGIES.map((s) => {
                      const v = d.affinity?.[r]?.[s] ?? 0;
                      return (
                        <td key={s} className="cell" style={{ background: sequentialColor(v) }} title={`${r} × ${s}: ${v}`}>
                          {v > 0 ? v.toFixed(2) : <span className="muted">·</span>}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollBox>
        ) : (
          <EmptyState title="No affinity matrix (no active model)" />
        )}
      </Card>
    </>
  );
}

export default function StrategiesPage() {
  const [mode, setMode] = useState<Mode>('PAPER');
  const perf = usePoll(`performance:${mode}`, () => api.performance(mode), 60_000);
  const cat = usePoll('strategies', api.strategies, 120_000);
  const byStrategy = useMemo(() => toRows(perf.data?.byStrategy), [perf.data]);
  const byRegime = useMemo(() => toRows(perf.data?.byRegime), [perf.data]);
  const byExit = useMemo(() => toRows(perf.data?.byExitReason), [perf.data]);
  const byModel = useMemo(() => toRows(perf.data?.byModel), [perf.data]);

  return (
    <>
      <PageHeader title="Strategy performance">
        <Segmented label="Mode" value={mode} options={['PAPER', 'LIVE'] as const} onChange={setMode} />
      </PageHeader>
      <DataState data={perf.data} error={perf.error} loading={perf.loading} reload={perf.reload}>
        {(p) => (
          <>
            <Card title={`Overall (${p.mode})`}>
              <div className="kpis">
                <Kpi label="Trades" value={p.overall.trades} hint={`${p.overall.wins}W / ${p.overall.losses}L`} />
                <Kpi label="Win rate" value={fmtFrac(p.overall.winRate)} />
                <Kpi label="Expectancy" value={fmtR(p.overall.expectancyR)} tone={pnlClass(p.overall.expectancyR) as 'pos' | 'neg' | ''} />
                <Kpi label="Profit factor" value={p.overall.profitFactor === null ? '∞' : fmtNum(p.overall.profitFactor, 2)} />
                <Kpi label="Total P&L" value={fmtMoney(p.overall.totalPnl, { sign: true })} tone={pnlClass(p.overall.totalPnl) as 'pos' | 'neg' | ''} />
                <Kpi label="Max DD (trades)" value={fmtPct(p.overall.maxDrawdownPct)} />
                <Kpi label="Max DD (curve)" value={fmtPct(p.curve.maxDrawdownPct)} />
                <Kpi label="Sharpe" value={fmtNum(p.curve.sharpe, 2)} hint="annualised, daily" />
                <Kpi label="Sortino" value={fmtNum(p.curve.sortino, 2)} />
                <Kpi label="Calmar" value={fmtNum(p.curve.calmar, 2)} />
                <Kpi label="Return" value={fmtPct(p.curve.totalReturnPct, { sign: true })} tone={pnlClass(p.curve.totalReturnPct) as 'pos' | 'neg' | ''} hint={`${fmtNum(p.curve.days, 0)} days`} />
                <Kpi label="Total fees" value={fmtMoney(p.overall.totalFees)} />
                <Kpi label="Avg slippage" value={fmtMoney(p.overall.avgSlippage)} />
                <Kpi label="EV realization" value={p.overall.evRealization === null ? '—' : fmtNum(p.overall.evRealization, 2)} hint="realized / expected" />
              </div>
            </Card>
            <div className="grid grid-2">
              <Card title="Expectancy by strategy">
                {byStrategy.length ? <ExpectancyBars rows={byStrategy} label={humanize} /> : <EmptyState title="No closed trades" />}
              </Card>
              <Card title="Expectancy by regime">
                {byRegime.length ? <ExpectancyBars rows={byRegime} label={regimeLabel} /> : <EmptyState title="No closed trades" />}
              </Card>
            </div>
            <Card title="By strategy">
              <Table rows={byStrategy} rowKey={(r) => r.key} columns={perfColumns('Strategy', humanize)} initialSort={{ key: 'trades', dir: 'desc' }} emptyTitle="No closed trades" />
            </Card>
            <Card title="By regime">
              <Table rows={byRegime} rowKey={(r) => r.key} columns={perfColumns('Regime', (k) => <RegimeBadge regime={k} />)} initialSort={{ key: 'trades', dir: 'desc' }} emptyTitle="No closed trades" />
            </Card>
            <Card title="Regime × strategy expectancy (R)" subtitle="green = positive expectancy, red = negative; n = trades">
              <RegimeStrategyHeatmap data={p.byRegimeStrategy} />
            </Card>
            <div className="grid grid-2">
              <Card title="By exit reason">
                <Table rows={byExit} rowKey={(r) => r.key} columns={perfColumns('Exit reason').slice(0, 6)} initialSort={{ key: 'trades', dir: 'desc' }} emptyTitle="No closed trades" />
              </Card>
              <Card title="By model version">
                <Table rows={byModel} rowKey={(r) => r.key} columns={perfColumns('Model', (k) => <span className="mono">{k}</span>).slice(0, 6)} initialSort={{ key: 'trades', dir: 'desc' }} emptyTitle="No closed trades" />
              </Card>
            </div>
          </>
        )}
      </DataState>
      <DataState data={cat.data} error={cat.error} loading={cat.loading} reload={cat.reload}>
        {(d) => <Catalog d={d} />}
      </DataState>
    </>
  );
}
