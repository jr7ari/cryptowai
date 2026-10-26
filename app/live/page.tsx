'use client';

import { ExName, useExchangeLabel } from '@/components/ExchangeName';
import { useId, useState } from 'react';
import { api, LIVE_CONFIRM_PHRASE } from '@/lib/api';
import { fmtDuration, fmtMoney, fmtNum, fmtTs, humanize, shortId } from '@/lib/format';
import { useNow, usePoll } from '@/lib/hooks';
import { useOperator } from '@/lib/operator';
import type { PendingLiveOrder, VenueCapabilities } from '@/lib/types';
import { ConfirmDialog } from '@/components/Modal';
import { useAction, useEngine } from '@/components/providers';
import { Table } from '@/components/Table';
import { Badge, Card, DataState, EmptyState, JsonView, KV, PageHeader, PassFail, ScrollBox } from '@/components/ui';

function PendingOrderCard({ p, onDone }: { p: PendingLiveOrder; onDone: () => void }) {
  const now = useNow(500);
  const left = p.expiresAt - now;
  const [confirm, setConfirm] = useState(false);
  const { run, busy } = useAction();
  return (
    <Card title="FIRST LIVE ORDER awaiting confirmation" className="card-danger">
      <div className="grid grid-2">
        <KV
          items={[
            ['Decision', <span key="d" className="mono">{shortId(p.decisionId, 12)}</span>],
            ['Symbol', <span key="s" className="mono">{p.symbol}</span>],
            ['Strategy', p.strategy ? humanize(p.strategy) : '—'],
            ['Expires', fmtTs(p.expiresAt)],
          ]}
        />
        <div className="stack" style={{ alignItems: 'flex-start' }}>
          <span className="muted small">Time left</span>
          <span className="countdown" aria-live="polite">
            {left > 0 ? fmtDuration(left) : 'EXPIRED'}
          </span>
          <button type="button" className="btn btn-danger" disabled={left <= 0 || !!busy} onClick={() => setConfirm(true)}>
            Confirm FIRST live order
          </button>
        </div>
      </div>
      <h3>Rationale</h3>
      <p>{p.rationale}</p>
      <p className="muted small">
        On confirmation the engine re-runs a fresh decision (new data, new risk checks) for {p.symbol} instead of executing the stale order.
      </p>
      <ConfirmDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        danger
        busy={!!busy}
        title="Confirm the first LIVE order"
        confirmLabel="Send to exchange"
        onConfirm={async () => {
          const r = await run('Confirm first live order', () => api.confirmFirstOrder(p.decisionId), (x) => x.message);
          setConfirm(false);
          if (r) onDone();
        }}
      >
        <p>
          This places <strong>real orders</strong> on <ExName /> for {p.strategy ? humanize(p.strategy) : 'the selected strategy'} on {p.symbol}. Subsequent live
          orders will not ask again until LIVE is re-armed.
        </p>
      </ConfirmDialog>
    </Card>
  );
}

function CapRow({ name, c }: { name: string; c: VenueCapabilities | undefined }) {
  return (
    <tr>
      <th scope="row">{name}</th>
      <td>{c ? <PassFail passed={c.options} label={c.options ? 'YES' : 'NO'} /> : '—'}</td>
      <td>{c ? <PassFail passed={c.futures} label={c.futures ? 'YES' : 'NO'} /> : '—'}</td>
      <td className="wrap muted">{c?.reason ?? ''}</td>
    </tr>
  );
}

export default function LivePage() {
  const { status, refreshStatus } = useEngine();
  const exLabel = useExchangeLabel();
  const { hasToken } = useOperator();
  const readiness = usePoll('live-readiness', api.liveReadiness, 30_000);
  const verify = usePoll('audit-verify', api.auditVerify, 120_000);
  const audit = usePoll('audit', () => api.audit(100), 30_000);
  const { run, busy } = useAction();
  const [phrase, setPhrase] = useState('');
  const [disarm, setDisarm] = useState(false);
  const [armMsg, setArmMsg] = useState<{ ok: boolean; message: string; checks: unknown } | null>(null);
  const pid = useId();

  const armed = status?.live.armed ?? false;
  const rec = status?.lastReconcile;

  return (
    <>
      <PageHeader title="LIVE control">
        {armed ? (
          <Badge tone="red" pulse>
            LIVE ARMED
          </Badge>
        ) : (
          <Badge tone="blue">DISARMED (PAPER)</Badge>
        )}
      </PageHeader>

      {status?.pendingLiveOrder && <PendingOrderCard p={status.pendingLiveOrder} onDone={() => void refreshStatus()} />}

      <div className="grid grid-2">
        <Card
          title="Readiness checklist"
          actions={
            <button type="button" className="btn btn-sm" onClick={() => void readiness.reload()} disabled={readiness.loading}>
              Re-check
            </button>
          }
        >
          <DataState data={readiness.data} error={readiness.error} loading={readiness.loading} reload={readiness.reload}>
            {(r) => (
              <>
                <div style={{ marginBottom: 8 }}>
                  <PassFail passed={r.ready} label={r.ready ? 'READY FOR LIVE' : 'NOT READY'} />
                </div>
                <ul className="checklist">
                  {r.checks.map((c) => (
                    <li key={c.name}>
                      <PassFail passed={c.passed} />
                      <span className="ck-name">{c.name}</span>
                      <span className="ck-detail">{c.detail}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </DataState>
        </Card>

        <Card title={armed ? 'Disarm LIVE' : 'Arm LIVE'} className={armed ? 'card-danger' : 'card-warn'}>
          {armed ? (
            <>
              <KV
                items={[
                  ['Armed by', status?.live.armedBy ?? '—'],
                  ['Armed at', fmtTs(status?.live.armedAt)],
                  ['First order confirmed', status?.live.firstOrderConfirmed ? 'yes' : 'no'],
                  ['LIVE equity', fmtMoney(status?.accounts.LIVE?.equity)],
                ]}
              />
              <button type="button" className="btn btn-primary" style={{ marginTop: 12 }} onClick={() => setDisarm(true)} disabled={!!busy}>
                Disarm LIVE (back to PAPER)
              </button>
              <p className="muted small" style={{ marginTop: 8 }}>
                Disarming is always allowed. Open live positions remain monitored for exits.
              </p>
            </>
          ) : (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (phrase !== LIVE_CONFIRM_PHRASE) return;
                // arm returns HTTP 400 with checks when readiness fails: surface them
                try {
                  const r = await api.armLive(phrase);
                  setArmMsg({ ok: r.ok, message: r.message, checks: r.checks });
                } catch (err) {
                  const body = (err as { body?: { message?: string; checks?: unknown } }).body;
                  setArmMsg({ ok: false, message: body?.message ?? (err as Error).message, checks: body?.checks ?? [] });
                }
                setPhrase('');
                void refreshStatus();
                void readiness.reload();
              }}
            >
              <p>
                Arming switches the engine to LIVE after re-running every readiness check. The <strong>first</strong> live order will still need a separate
                confirmation. A restart always comes back disarmed.
              </p>
              {!hasToken && <div className="banner banner-warn compact">An operator token is required. Set it via “Operator” in the header.</div>}
              <div className="field">
                <label htmlFor={pid} className="field-label">
                  Type <code className="confirm-code">{LIVE_CONFIRM_PHRASE}</code> to arm
                </label>
                <input id={pid} className="input mono" value={phrase} onChange={(e) => setPhrase(e.target.value)} autoComplete="off" spellCheck={false} />
              </div>
              <button type="submit" className="btn btn-danger" disabled={phrase !== LIVE_CONFIRM_PHRASE || !!busy}>
                ARM LIVE TRADING
              </button>
            </form>
          )}
          {armMsg && (
            <div className={`banner ${armMsg.ok ? 'banner-info' : 'banner-error'} compact`} style={{ marginTop: 12 }} role="status">
              {armMsg.message}
            </div>
          )}
          {armMsg && Array.isArray(armMsg.checks) && armMsg.checks.length > 0 && <JsonView value={armMsg.checks} summary="Checks evaluated at arm time" />}
        </Card>
      </div>

      <Card title="Venue capabilities">
        <div className="note note-info" style={{ marginBottom: 12 }}>
          LIVE options are <strong>not implemented</strong> for <ExName /> (CoinDCX has no options API; Delta&apos;s options API needs its own validated adapter). LIVE mode therefore trades <strong>futures only</strong> (FUTURES_LONG / FUTURES_SHORT / FUTURES_TSMOM with
          mandatory stops). FUTURES_CARRY / XSMOM / MR are PAPER-only until independently validated. Options run in PAPER against real Deribit quotes.
        </div>
        <ScrollBox>
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Venue</th>
                <th scope="col">Options</th>
                <th scope="col">Futures</th>
                <th scope="col">Notes</th>
              </tr>
            </thead>
            <tbody>
              <CapRow name="PAPER" c={status?.capabilities.paper} />
              <CapRow name={`LIVE (${exLabel})`} c={status?.capabilities.live} />
            </tbody>
          </table>
        </ScrollBox>
      </Card>

      <Card title="Last reconciliation" subtitle="Local book vs exchange positions">
        {!rec ? (
          <EmptyState title="No reconciliation has run">Reconciliation runs at startup and every minute while LIVE, when credentials are configured.</EmptyState>
        ) : (
          <>
            <div className="row" style={{ marginBottom: 8 }}>
              <PassFail passed={rec.ok} label={rec.ok ? 'IN SYNC' : 'MISMATCH'} />
              <span className="muted small">{fmtTs(rec.ts)}</span>
              {rec.unresolvedOrders > 0 && <Badge tone="amber">{rec.unresolvedOrders} unresolved orders</Badge>}
              {rec.balance && (
                <span className="small">
                  equity {fmtMoney(rec.balance.equity)} · cash {fmtMoney(rec.balance.cash)} · margin {fmtMoney(rec.balance.marginInUse)}
                </span>
              )}
            </div>
            {rec.error && <div className="banner banner-error compact">{rec.error}</div>}
            <Table
              rows={rec.mismatches}
              rowKey={(m) => m.instrument}
              emptyTitle="No mismatches"
              columns={[
                { key: 'instrument', header: 'Instrument', render: (m) => <span className="mono">{m.instrument}</span> },
                { key: 'exchangeQty', header: 'Exchange qty', align: 'right', render: (m) => fmtNum(m.exchangeQty, 4) },
                { key: 'localQty', header: 'Local qty', align: 'right', render: (m) => fmtNum(m.localQty, 4) },
                { key: 'diff', header: 'Diff', align: 'right', render: (m) => <span className="neg">{fmtNum(m.diff, 4)}</span> },
              ]}
            />
          </>
        )}
      </Card>

      <div className="grid grid-2">
        <Card
          title="Audit chain verification"
          subtitle="Recomputes the hash chain of every append-only ledger"
          actions={
            <button type="button" className="btn btn-sm" onClick={() => void verify.reload()} disabled={verify.loading}>
              Verify now
            </button>
          }
        >
          <DataState data={verify.data} error={verify.error} loading={verify.loading} reload={verify.reload}>
            {(v) => (
              <ul className="checklist">
                {Object.entries(v).map(([k, r]) => (
                  <li key={k}>
                    <PassFail passed={r.ok} label={r.ok ? 'INTACT' : 'BROKEN'} />
                    <span className="ck-name">{k}</span>
                    <span className="ck-detail">
                      {r.checked} records checked{r.brokenAt !== null ? ` · broken at seq ${r.brokenAt}` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </DataState>
        </Card>
        <Card title="Recent audit log">
          <DataState data={audit.data} error={audit.error} loading={audit.loading} reload={audit.reload}>
            {(a) => (
              <Table
                dense
                rows={a}
                rowKey={(r) => r.id}
                initialSort={{ key: 'ts', dir: 'desc' }}
                maxHeight={420}
                emptyTitle="No audit records"
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
      </div>

      <ConfirmDialog
        open={disarm}
        onClose={() => setDisarm(false)}
        busy={!!busy}
        title="Disarm LIVE trading"
        confirmLabel="Disarm"
        onConfirm={async () => {
          const r = await run('Disarm LIVE', () => api.disarmLive('manual (dashboard)'), () => 'LIVE disarmed: engine is back in PAPER');
          setDisarm(false);
          if (r) void refreshStatus();
        }}
      >
        <p>The engine returns to PAPER immediately. Existing live positions keep being monitored for exits.</p>
      </ConfirmDialog>
    </>
  );
}
