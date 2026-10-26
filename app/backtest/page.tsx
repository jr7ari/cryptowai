'use client';

import { useEffect, useState } from 'react';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api } from '@/lib/api';
import { fmtAxisTime, fmtDate, fmtFrac, fmtMoney, fmtNum, fmtPct, fmtR, fmtTs, humanize, pnlClass, shortId } from '@/lib/format';
import { usePoll } from '@/lib/hooks';
import { STRATEGIES, type BacktestJob, type BacktestRequest, type BacktestResult, type StrategyName } from '@/lib/types';
import { AXIS, ChartBox, GRID, SERIES_COLORS, TOOLTIP_STYLE } from '@/components/charts';
import { useAction, useEngine } from '@/components/providers';
import { Table } from '@/components/Table';
import { Badge, Card, DataState, EmptyState, ErrorBanner, Field, Loading, PageHeader } from '@/components/ui';

type PolicyKind = BacktestRequest['policy'];

function JobStatus({ s }: { s: BacktestJob['status'] }) {
  return (
    <Badge tone={s === 'DONE' ? 'green' : s === 'FAILED' ? 'red' : 'amber'} pulse={s === 'RUNNING'}>
      {s}
    </Badge>
  );
}

function EquityOverlay({ results }: { results: BacktestResult[] }) {
  const series = results.filter((r) => (r.equity?.length ?? 0) > 1);
  if (!series.length) return <EmptyState title="No equity curves in this result" />;
  return (
    <ChartBox height={320} label="Backtest equity curves">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
          <CartesianGrid {...GRID} />
          <XAxis dataKey="ts" type="number" scale="time" domain={['dataMin', 'dataMax']} tickFormatter={fmtAxisTime} minTickGap={40} allowDuplicatedCategory={false} {...AXIS} />
          <YAxis domain={['auto', 'auto']} width={72} tickFormatter={(v: number) => fmtMoney(v)} {...AXIS} />
          <Tooltip {...TOOLTIP_STYLE} labelFormatter={(v) => fmtTs(Number(v))} formatter={(v, n) => [fmtMoney(Number(v)), String(n)]} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          {series.map((r, i) => (
            <Line
              key={`${r.label}-${i}`}
              data={r.equity}
              dataKey="equity"
              name={r.label}
              stroke={SERIES_COLORS[i % SERIES_COLORS.length]}
              strokeWidth={i === 0 ? 2.2 : 1.3}
              strokeDasharray={i === 0 ? undefined : '5 3'}
              dot={false}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </ChartBox>
  );
}

function Comparison({ results }: { results: BacktestResult[] }) {
  return (
    <Table
      rows={results}
      rowKey={(r, i) => `${r.label}-${i}`}
      columns={[
        { key: 'label', header: 'Policy', render: (r) => <strong>{r.label}</strong> },
        { key: 'trades', header: 'Trades', align: 'right', sort: (r) => r.metrics.trades, render: (r) => r.metrics.trades },
        { key: 'winRate', header: 'Win rate', align: 'right', sort: (r) => r.metrics.winRate, render: (r) => fmtFrac(r.metrics.winRate) },
        { key: 'expectancyR', header: 'Expectancy', align: 'right', sort: (r) => r.metrics.expectancyR, render: (r) => <span className={pnlClass(r.metrics.expectancyR)}>{fmtR(r.metrics.expectancyR)}</span> },
        { key: 'pf', header: 'PF', align: 'right', sort: (r) => r.metrics.profitFactor ?? Infinity, render: (r) => (r.metrics.profitFactor === null ? '∞' : fmtNum(r.metrics.profitFactor, 2)) },
        { key: 'ret', header: 'Return', align: 'right', sort: (r) => r.curve.totalReturnPct, render: (r) => <span className={pnlClass(r.curve.totalReturnPct)}>{fmtPct(r.curve.totalReturnPct, { sign: true })}</span> },
        { key: 'sharpe', header: 'Sharpe', align: 'right', sort: (r) => r.curve.sharpe, render: (r) => fmtNum(r.curve.sharpe, 2) },
        { key: 'dd', header: 'Max DD', align: 'right', sort: (r) => r.curve.maxDrawdownPct, render: (r) => fmtPct(r.curve.maxDrawdownPct) },
        { key: 'fees', header: 'Fees', align: 'right', sort: (r) => r.metrics.totalFees, render: (r) => fmtMoney(r.metrics.totalFees) },
        { key: 'decisions', header: 'Decisions', align: 'right', render: (r) => `${r.decisions} (${r.blocked} blocked)` },
      ]}
    />
  );
}

function JobView({ id }: { id: string }) {
  const [running, setRunning] = useState(true);
  const job = usePoll(`backtest:${id}`, () => api.backtest(id), running ? 2_000 : 0);
  useEffect(() => {
    if (job.data && job.data.status !== 'RUNNING') setRunning(false);
  }, [job.data]);

  return (
    <DataState data={job.data} error={job.error} loading={job.loading} reload={job.reload}>
      {(j) => (
        <div className="stack">
          <div className="row">
            <JobStatus s={j.status} />
            <span className="mono small">{shortId(j.id)}</span>
            <span className="muted small">
              {fmtDate(Number(j.request.from))} → {fmtDate(Number(j.request.to))} · {Array.isArray(j.request.symbols) ? (j.request.symbols as string[]).join(', ') : ''} · model{' '}
              {String(j.request.modelVersion ?? '—')}
            </span>
          </div>
          {j.status === 'RUNNING' && <Loading label="Backtest running…" />}
          {j.error && <ErrorBanner error={new Error(j.error)} compact />}
          {j.progress.length > 0 && j.status === 'RUNNING' && <pre className="log">{j.progress.slice(-15).join('\n')}</pre>}
          {j.results && j.results.length > 0 && (
            <>
              <Comparison results={j.results} />
              <EquityOverlay results={j.results} />
              <p className="muted small">The first row is the selected policy; the dashed curves are baselines. Past simulated results do not predict future returns.</p>
            </>
          )}
        </div>
      )}
    </DataState>
  );
}

export default function BacktestPage() {
  const { status } = useEngine();
  const symbols = status?.symbols ?? [];
  const [days, setDays] = useState(60);
  const [selSymbols, setSelSymbols] = useState<string[]>([]);
  const [policy, setPolicy] = useState<PolicyKind>('REGIME_ENGINE');
  const [strategy, setStrategy] = useState<StrategyName>('LONG_STRADDLE');
  const [every, setEvery] = useState(1);
  const [baselines, setBaselines] = useState(true);
  const [jobId, setJobId] = useState<string | null>(null);
  const { run, busy } = useAction();
  const jobs = usePoll('backtests', api.backtests, 10_000);

  useEffect(() => {
    if (!selSymbols.length && symbols.length) setSelSymbols(symbols);
    // initialise once when the symbol list arrives
  }, [symbols.join(',')]);

  const submit = async () => {
    const to = Date.now();
    const req: BacktestRequest = {
      from: to - Math.max(1, days) * 86_400_000,
      to,
      symbols: selSymbols,
      policy,
      strategy: policy === 'FIXED' ? strategy : undefined,
      decisionEveryBars: Math.max(1, Math.round(every)),
      compareBaselines: baselines,
    };
    const r = await run('Start backtest', () => api.startBacktest(req), (x) => `Backtest ${shortId(x.id)} started`);
    if (r) {
      setJobId(r.id);
      void jobs.reload();
    }
  };

  return (
    <>
      <PageHeader title="Backtests" />
      <Card title="New backtest" subtitle="Runs on stored candles in a worker thread on the engine">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <div className="form-row">
            <Field label="Days back" hint="from = now − days">
              <input className="input" type="number" min={1} max={730} value={days} onChange={(e) => setDays(Number(e.target.value))} />
            </Field>
            <Field label="Policy">
              <select className="input" value={policy} onChange={(e) => setPolicy(e.target.value as PolicyKind)}>
                <option value="REGIME_ENGINE">Regime engine</option>
                <option value="FIXED">Fixed strategy</option>
                <option value="RANDOM">Random</option>
              </select>
            </Field>
            {policy === 'FIXED' && (
              <Field label="Strategy">
                <select className="input" value={strategy} onChange={(e) => setStrategy(e.target.value as StrategyName)}>
                  {STRATEGIES.map((s) => (
                    <option key={s} value={s}>
                      {humanize(s)}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            <Field label="Decide every N bars">
              <input className="input" type="number" min={1} max={100} value={every} onChange={(e) => setEvery(Number(e.target.value))} />
            </Field>
          </div>
          <fieldset className="field" style={{ border: 0, padding: 0, margin: '0 0 10px' }}>
            <legend className="field-label">Symbols</legend>
            <div className="row">
              {symbols.length ? (
                symbols.map((s) => (
                  <label key={s} className="check" style={{ margin: 0 }}>
                    <input
                      type="checkbox"
                      checked={selSymbols.includes(s)}
                      onChange={(e) => setSelSymbols((xs) => (e.target.checked ? [...xs, s] : xs.filter((x) => x !== s)))}
                    />
                    <span className="mono">{s}</span>
                  </label>
                ))
              ) : (
                <span className="muted small">Symbol list unavailable (engine status not loaded); the engine will use all configured symbols.</span>
              )}
            </div>
          </fieldset>
          <label className="check">
            <input type="checkbox" checked={baselines} onChange={(e) => setBaselines(e.target.checked)} />
            <span>Compare against baselines (fixed straddle, fixed call, fixed condor, random)</span>
          </label>
          <div className="row" style={{ marginTop: 8 }}>
            <button type="submit" className="btn btn-primary" disabled={!!busy || (symbols.length > 0 && !selSymbols.length)}>
              {busy ? 'Starting…' : 'Run backtest'}
            </button>
          </div>
        </form>
      </Card>

      {jobId && (
        <Card title="Result" actions={<button type="button" className="btn btn-sm" onClick={() => setJobId(null)}>Close</button>}>
          <JobView key={jobId} id={jobId} />
        </Card>
      )}

      <Card title="Previous jobs" subtitle="Kept in engine memory until restart">
        <DataState data={jobs.data} error={jobs.error} loading={jobs.loading} reload={jobs.reload}>
          {(d) => (
            <Table
              rows={d}
              rowKey={(j) => j.id}
              onRowClick={(j) => setJobId(j.id)}
              initialSort={{ key: 'createdAt', dir: 'desc' }}
              emptyTitle="No backtests run yet"
              columns={[
                { key: 'createdAt', header: 'Started', render: (j) => fmtTs(j.createdAt) },
                { key: 'id', header: 'ID', render: (j) => <span className="mono small">{shortId(j.id)}</span> },
                { key: 'status', header: 'Status', render: (j) => <JobStatus s={j.status} /> },
                { key: 'policy', header: 'Policy', sort: (j) => String(j.request.policy ?? ''), render: (j) => String(j.request.policy ?? 'REGIME_ENGINE') + (j.request.strategy ? ` (${String(j.request.strategy)})` : '') },
                { key: 'range', header: 'Range', sortable: false, render: (j) => `${fmtDate(Number(j.request.from))} → ${fmtDate(Number(j.request.to))}` },
                { key: 'results', header: 'Runs', align: 'right', sort: (j) => j.results?.length ?? 0, render: (j) => j.results?.length ?? 0 },
                {
                  key: 'best',
                  header: 'Main expectancy',
                  align: 'right',
                  sort: (j) => j.results?.[0]?.metrics.expectancyR,
                  render: (j) => (j.results?.[0] ? <span className={pnlClass(j.results[0].metrics.expectancyR)}>{fmtR(j.results[0].metrics.expectancyR)}</span> : '—'),
                },
                { key: 'error', header: 'Error', sortable: false, className: 'wrap', render: (j) => (j.error ? <span className="neg small">{j.error}</span> : '') },
              ]}
            />
          )}
        </DataState>
      </Card>
    </>
  );
}
