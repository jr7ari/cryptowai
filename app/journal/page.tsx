'use client';

import { useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { downloadText, toCsv } from '@/lib/csv';
import { fmtDuration, fmtFrac, fmtMoney, fmtR, fmtTs, humanize, pnlClass, shortId } from '@/lib/format';
import { usePoll } from '@/lib/hooks';
import { REGIMES, STRATEGIES, type AuditRecord, type DecisionRecord, type TradeRecord } from '@/lib/types';
import { DecisionDrawer } from '@/components/DecisionDrawer';
import { useEngine } from '@/components/providers';
import { Table } from '@/components/Table';
import { ActionBadge } from '@/components/trading';
import { Badge, Card, DataState, Field, Kpi, PageHeader, RegimeBadge } from '@/components/ui';

const CSV_COLUMNS: Array<{ header: string; value: (t: TradeRecord) => unknown }> = [
  { header: 'positionId', value: (t) => t.positionId },
  { header: 'decisionId', value: (t) => t.decisionId },
  { header: 'mode', value: (t) => t.mode },
  { header: 'source', value: (t) => t.source },
  { header: 'openedAt', value: (t) => new Date(t.openedAt).toISOString() },
  { header: 'closedAt', value: (t) => new Date(t.closedAt).toISOString() },
  { header: 'holdingHours', value: (t) => (t.holdingMs / 3_600_000).toFixed(3) },
  { header: 'underlying', value: (t) => t.underlying },
  { header: 'strategy', value: (t) => t.strategy },
  { header: 'regime', value: (t) => t.regime },
  { header: 'regimeConfidence', value: (t) => t.regimeConfidence },
  { header: 'entryCost', value: (t) => t.entryCost },
  { header: 'maxLoss', value: (t) => t.maxLoss },
  { header: 'realizedPnl', value: (t) => t.realizedPnl },
  { header: 'returnOnRisk', value: (t) => t.returnOnRisk },
  { header: 'fees', value: (t) => t.fees },
  { header: 'funding', value: (t) => t.funding },
  { header: 'slippageCost', value: (t) => t.slippageCost },
  { header: 'mae', value: (t) => t.mae },
  { header: 'mfe', value: (t) => t.mfe },
  { header: 'exitReason', value: (t) => t.exitReason },
  { header: 'expectedValueAtEntry', value: (t) => t.expectedValueAtEntry },
  { header: 'popAtEntry', value: (t) => t.popAtEntry },
  { header: 'modelVersion', value: (t) => t.modelVersion },
  { header: 'params', value: (t) => t.params },
];

function TradesSection() {
  const [mode, setMode] = useState('');
  const [strategy, setStrategy] = useState('');
  const [regime, setRegime] = useState('');
  const key = `trades:${mode}:${strategy}:${regime}`;
  const trades = usePoll(key, () => api.trades({ mode: (mode || undefined) as 'PAPER' | 'LIVE' | undefined, strategy: strategy || undefined, regime: regime || undefined, limit: 2000 }), 60_000);

  const summary = useMemo(() => {
    const t = trades.data ?? [];
    const pnl = t.reduce((a, x) => a + x.realizedPnl, 0);
    const wins = t.filter((x) => x.realizedPnl > 0).length;
    const r = t.length ? t.reduce((a, x) => a + (Number.isFinite(x.returnOnRisk) ? x.returnOnRisk : 0), 0) / t.length : 0;
    const fees = t.reduce((a, x) => a + x.fees, 0);
    return { n: t.length, pnl, winRate: t.length ? wins / t.length : 0, r, fees };
  }, [trades.data]);

  return (
    <Card
      title="Trade journal"
      actions={
        <button
          type="button"
          className="btn btn-sm"
          disabled={!trades.data?.length}
          onClick={() => trades.data && downloadText(`trades-${mode || 'all'}-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(trades.data, CSV_COLUMNS))}
        >
          Export CSV
        </button>
      }
    >
      <div className="form-row">
        <Field label="Mode">
          <select className="input" value={mode} onChange={(e) => setMode(e.target.value)}>
            <option value="">All</option>
            <option value="PAPER">PAPER</option>
            <option value="LIVE">LIVE</option>
          </select>
        </Field>
        <Field label="Strategy">
          <select className="input" value={strategy} onChange={(e) => setStrategy(e.target.value)}>
            <option value="">All</option>
            {STRATEGIES.map((s) => (
              <option key={s} value={s}>
                {humanize(s)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Regime">
          <select className="input" value={regime} onChange={(e) => setRegime(e.target.value)}>
            <option value="">All</option>
            {REGIMES.map((r) => (
              <option key={r} value={r}>
                {humanize(r)}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <div className="kpis" style={{ marginBottom: 12 }}>
        <Kpi label="Trades" value={summary.n} />
        <Kpi label="Win rate" value={fmtFrac(summary.winRate)} />
        <Kpi label="Avg R" value={fmtR(summary.r)} tone={pnlClass(summary.r) as 'pos' | 'neg' | ''} />
        <Kpi label="Net P&L" value={fmtMoney(summary.pnl, { sign: true })} tone={pnlClass(summary.pnl) as 'pos' | 'neg' | ''} />
        <Kpi label="Fees" value={fmtMoney(summary.fees)} />
      </div>
      <DataState data={trades.data} error={trades.error} loading={trades.loading} reload={trades.reload}>
        {(d) => (
          <Table
            rows={d}
            rowKey={(t) => t.positionId}
            initialSort={{ key: 'closedAt', dir: 'desc' }}
            maxHeight={560}
            emptyTitle="No closed trades match these filters"
            columns={[
              { key: 'openedAt', header: 'Opened', render: (t) => fmtTs(t.openedAt) },
              { key: 'closedAt', header: 'Closed', render: (t) => <span title={`held ${fmtDuration(t.holdingMs)}`}>{fmtTs(t.closedAt)}</span> },
              { key: 'mode', header: 'Mode', render: (t) => <Badge tone={t.mode === 'LIVE' ? 'red' : 'blue'}>{t.mode}</Badge> },
              { key: 'underlying', header: 'Underlying', render: (t) => <span className="mono">{t.underlying}</span> },
              { key: 'strategy', header: 'Strategy', render: (t) => humanize(t.strategy) },
              { key: 'regime', header: 'Regime', sort: (t) => t.regime, render: (t) => <RegimeBadge regime={t.regime} confidence={t.regimeConfidence} /> },
              { key: 'entryCost', header: 'Entry cost', align: 'right', render: (t) => fmtMoney(t.entryCost) },
              { key: 'maxLoss', header: 'Max loss', align: 'right', render: (t) => fmtMoney(t.maxLoss) },
              {
                key: 'grossPnl',
                header: 'Gross',
                align: 'right',
                render: (t) => (t.grossPnl === undefined ? <span className="muted">—</span> : <span className={pnlClass(t.grossPnl)} title="Price P&L before fees and funding">{fmtMoney(t.grossPnl, { sign: true })}</span>),
              },
              { key: 'realizedPnl', header: 'Net realized', align: 'right', render: (t) => <span className={pnlClass(t.realizedPnl)}>{fmtMoney(t.realizedPnl, { sign: true })}</span> },
              { key: 'returnOnRisk', header: 'R', align: 'right', render: (t) => <span className={pnlClass(t.returnOnRisk)}>{fmtR(t.returnOnRisk)}</span> },
              { key: 'fees', header: 'Fees', align: 'right', render: (t) => fmtMoney(t.fees) },
              { key: 'slippageCost', header: 'Slippage', align: 'right', render: (t) => fmtMoney(t.slippageCost) },
              { key: 'mae', header: 'MAE', align: 'right', render: (t) => <span className="neg">{fmtMoney(t.mae)}</span> },
              { key: 'mfe', header: 'MFE', align: 'right', render: (t) => <span className="pos">{fmtMoney(t.mfe)}</span> },
              {
                key: 'exitReason',
                header: 'Exit',
                render: (t) => {
                  const parts = (t.bookings ?? []).filter((b) => b.kind === 'PARTIAL');
                  return (
                    <span title={(t.bookings ?? []).map((b) => `${new Date(b.ts).toISOString().slice(0, 16)} ${b.reason} ${b.qty} @ ${b.price.toFixed(2)}: gross ${b.grossPnl.toFixed(2)}, fees ${b.fees.toFixed(2)}`).join('\n') || undefined}>
                      <Badge>{t.exitReason}</Badge>
                      {parts.length > 0 && <span className="muted small"> +{parts.length} partial</span>}
                    </span>
                  );
                },
              },
              { key: 'modelVersion', header: 'Model', render: (t) => <span className="mono small">{t.modelVersion}</span> },
            ]}
          />
        )}
      </DataState>
    </Card>
  );
}

function DecisionsSection() {
  const { status } = useEngine();
  const [symbol, setSymbol] = useState('');
  const [action, setAction] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const decisions = usePoll(`decisions:${symbol}:${action}`, () => api.decisions({ symbol: symbol || undefined, action: action || undefined, limit: 200 }), 30_000);

  return (
    <Card title="Decision audit" subtitle="Every decision, including NO_TRADE, HOLDING and BLOCKED. Click a row for the full record.">
      <div className="form-row">
        <Field label="Symbol">
          <select className="input" value={symbol} onChange={(e) => setSymbol(e.target.value)}>
            <option value="">All</option>
            {(status?.symbols ?? []).map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Action">
          <select className="input" value={action} onChange={(e) => setAction(e.target.value)}>
            <option value="">All</option>
            <option value="OPEN">OPEN</option>
            <option value="NO_TRADE">NO_TRADE</option>
            <option value="HOLDING">HOLDING</option>
            <option value="BLOCKED">BLOCKED</option>
          </select>
        </Field>
      </div>
      <DataState data={decisions.data} error={decisions.error} loading={decisions.loading} reload={decisions.reload}>
        {(d) => (
          <Table<DecisionRecord>
            rows={d}
            rowKey={(r) => r.id}
            onRowClick={(r) => setOpen(r.id)}
            initialSort={{ key: 'ts', dir: 'desc' }}
            maxHeight={560}
            emptyTitle="No decisions match these filters"
            columns={[
              { key: 'ts', header: 'Time', render: (r) => fmtTs(r.ts) },
              { key: 'id', header: 'ID', render: (r) => <span className="mono small">{shortId(r.id)}</span> },
              { key: 'mode', header: 'Mode', render: (r) => <Badge tone={r.mode === 'LIVE' ? 'red' : 'blue'}>{r.mode}</Badge> },
              { key: 'symbol', header: 'Symbol', render: (r) => <span className="mono">{r.symbol}</span> },
              { key: 'action', header: 'Action', render: (r) => <ActionBadge action={r.action} /> },
              { key: 'regime', header: 'Regime', sort: (r) => r.regime?.primary, render: (r) => <RegimeBadge regime={r.regime?.primary} confidence={r.regime?.confidence} /> },
              { key: 'selected', header: 'Selected', render: (r) => (r.selected ? humanize(r.selected) : <span className="muted">—</span>) },
              {
                key: 'eligible',
                header: 'Eligible',
                align: 'right',
                sort: (r) => r.candidates.filter((c) => c.eligible).length,
                render: (r) => `${r.candidates.filter((c) => c.eligible).length}/${r.candidates.length}`,
              },
              { key: 'rationale', header: 'Rationale', sortable: false, className: 'wrap rationale-cell', render: (r) => <span className="muted small clamp-3" title={r.rationale}>{r.rationale}</span> },
            ]}
          />
        )}
      </DataState>
      <DecisionDrawer id={open} onClose={() => setOpen(null)} />
    </Card>
  );
}

function AuditSection() {
  const audit = usePoll('audit', () => api.audit(100), 30_000);
  return (
    <Card title="Operator audit log" subtitle="Arm/disarm, kill switch, model changes, paper reset. Decision rows are in the table above.">
      <DataState data={audit.data} error={audit.error} loading={audit.loading} reload={audit.reload}>
        {(a) => (
          <Table<AuditRecord>
            dense
            rows={a}
            rowKey={(r) => r.id}
            initialSort={{ key: 'ts', dir: 'desc' }}
            maxHeight={360}
            emptyTitle="No operator audit records yet"
            columns={[
              { key: 'ts', header: 'Time', render: (r) => fmtTs(r.ts) },
              { key: 'actor', header: 'Actor' },
              { key: 'action', header: 'Action', render: (r) => <span className={`mono small ${/LIVE|KILL/.test(r.action) ? 'warn' : ''}`}>{r.action}</span> },
              {
                key: 'details',
                header: 'Details',
                sortable: false,
                className: 'wrap',
                render: (r) => <span className="muted small mono">{JSON.stringify(r.details).slice(0, 160)}</span>,
              },
            ]}
          />
        )}
      </DataState>
    </Card>
  );
}

export default function JournalPage() {
  return (
    <>
      <PageHeader title="Journal" />
      <TradesSection />
      <DecisionsSection />
      <AuditSection />
    </>
  );
}
