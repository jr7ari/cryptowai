'use client';

import { useState } from 'react';
import { api } from '@/lib/api';
import { fmtPct, fmtR, fmtTs } from '@/lib/format';
import { usePoll } from '@/lib/hooks';
import type { Check, ExperimentRecord, Mode, ModelStatus, ModelVersionDoc } from '@/lib/types';
import { ConfirmDialog, Modal } from '@/components/Modal';
import { useAction, useEngine } from '@/components/providers';
import { Table } from '@/components/Table';
import { Badge, Card, DataState, EmptyState, JsonView, KV, PageHeader, PassFail, type BadgeTone } from '@/components/ui';

const STATUS_TONE: Record<ModelStatus, BadgeTone> = {
  CANDIDATE: 'grey',
  VALIDATED: 'blue',
  ACTIVE_PAPER: 'blue',
  APPROVED_LIVE: 'red',
  RETIRED: 'grey',
  ROLLED_BACK: 'amber',
  REJECTED: 'red',
};

const EXP_TONE: Record<string, BadgeTone> = {
  WALK_FORWARD: 'purple',
  PROMOTION: 'green',
  ROLLBACK: 'amber',
  APPROVAL: 'red',
  REJECTION: 'red',
  BACKTEST: 'blue',
  BASELINE_COMPARISON: 'grey',
};

function asChecks(v: unknown): Check[] {
  return Array.isArray(v) ? (v.filter((c) => c && typeof c === 'object' && 'name' in c) as Check[]) : [];
}

function Checks({ checks }: { checks: Check[] }) {
  if (!checks.length) return <p className="muted small">No checks recorded.</p>;
  return (
    <ul className="checklist">
      {checks.map((c, i) => (
        <li key={i}>
          <PassFail passed={c.passed} />
          <span className="ck-name">{c.name}</span>
          <span className="ck-detail">{c.detail}</span>
        </li>
      ))}
    </ul>
  );
}

function ValidationSummary({ v }: { v: Record<string, unknown> | undefined }) {
  if (!v) return <span className="muted">—</span>;
  const checks = asChecks(v.checks);
  const passed = checks.filter((c) => c.passed).length;
  const num = (k: string) => (typeof v[k] === 'number' ? (v[k] as number) : undefined);
  return (
    <span className="small">
      {num('oosTrades') !== undefined && <>OOS {num('oosTrades')} tr · </>}
      {num('oosExpectancyR') !== undefined && <>{fmtR(num('oosExpectancyR'))} · </>}
      {num('oosMaxDrawdownPct') !== undefined && <>DD {fmtPct(num('oosMaxDrawdownPct'))} · </>}
      {checks.length > 0 && <Badge tone={passed === checks.length ? 'green' : 'amber'}>{`${passed}/${checks.length} checks`}</Badge>}
    </span>
  );
}

function ModelDetail({ m, onClose }: { m: ModelVersionDoc | null; onClose: () => void }) {
  return (
    <Modal open={!!m} onClose={onClose} title={`Model ${m?.version ?? ''}`} variant="drawer">
      {m && (
        <div className="stack">
          <KV
            items={[
              ['Status', <Badge key="s" tone={STATUS_TONE[m.status]}>{m.status}</Badge>],
              ['Parent', m.parentVersion ?? '—'],
              ['Created', fmtTs(m.createdAt)],
              ['Active in PAPER', m.activeInPaper ? 'yes' : 'no'],
              ['Active in LIVE', m.activeInLive ? 'yes' : 'no'],
              ['Approved by', m.approvedBy ? `${m.approvedBy} @ ${fmtTs(m.approvedAt)}` : '—'],
              ['Notes', m.notes ?? '—'],
            ]}
          />
          <Card title="Validation checks">
            <Checks checks={asChecks(m.validation?.checks)} />
          </Card>
          {m.validation && <JsonView value={m.validation} summary="Validation (raw)" />}
          {m.livePerformance && <JsonView value={m.livePerformance} summary="Live performance" />}
          {m.params !== undefined && <JsonView value={m.params} summary="Parameters" />}
        </div>
      )}
    </Modal>
  );
}

function ExperimentTimeline({ items }: { items: ExperimentRecord[] }) {
  if (!items.length) return <EmptyState title="No experiments yet">Walk-forward runs, promotions, rollbacks and backtests appear here.</EmptyState>;
  return (
    <ul className="feed">
      {items.map((e) => (
        <li key={e.id}>
          <div className="feed-main">
            <div className="row">
              <Badge tone={EXP_TONE[e.kind] ?? 'grey'}>{e.kind.replace('_', ' ')}</Badge>
              <span className="mono small">{e.modelVersion}</span>
              {e.baselineVersion && <span className="muted small">vs {e.baselineVersion}</span>}
              {e.decision && <Badge tone={e.decision === 'PROMOTED' ? 'green' : 'grey'}>{e.decision}</Badge>}
              <span className="spacer" />
              <span className="feed-meta">{fmtTs(e.ts)}</span>
            </div>
            <div className="feed-text" style={{ marginTop: 4 }}>
              {e.summary}
            </div>
            <JsonView value={e.metrics} summary="Metrics" />
          </div>
        </li>
      ))}
    </ul>
  );
}

export default function LearningPage() {
  const { refreshStatus, status } = useEngine();
  const models = usePoll('models', api.models, 30_000);
  const experiments = usePoll('experiments', () => api.experiments(100), 60_000);
  const learning = usePoll('learning-status', api.learningStatus, 5_000);
  const { run, busy } = useAction();
  const [detail, setDetail] = useState<ModelVersionDoc | null>(null);
  const [approve, setApprove] = useState<ModelVersionDoc | null>(null);
  const [approveResult, setApproveResult] = useState<{ approved: boolean; checks: Check[] } | null>(null);
  const [activate, setActivate] = useState<ModelVersionDoc | null>(null);
  const [rollbackMode, setRollbackMode] = useState<Mode | null>(null);

  const reloadAll = () => {
    void models.reload();
    void experiments.reload();
    void learning.reload();
    void refreshStatus();
  };

  const ls = learning.data;

  return (
    <>
      <PageHeader title="Models & learning">
        <button
          type="button"
          className="btn btn-primary"
          disabled={!!busy || ls?.running}
          onClick={async () => {
            const r = await run('Walk-forward', api.runLearning, () => 'Walk-forward started');
            if (r) void learning.reload();
          }}
        >
          {ls?.running ? 'Walk-forward running…' : 'Run walk-forward now'}
        </button>
        <button type="button" className="btn" disabled={!!busy} onClick={() => setRollbackMode('PAPER')}>
          Rollback PAPER
        </button>
        <button type="button" className="btn btn-warn" disabled={!!busy} onClick={() => setRollbackMode('LIVE')}>
          Rollback LIVE
        </button>
      </PageHeader>

      <div className="note">
        Learned models are <strong>never auto-deployed to LIVE</strong>. A model can at most be auto-activated in PAPER after passing walk-forward
        promotion criteria; LIVE requires explicit operator approval backed by paper evidence for that exact version.
      </div>

      <div className="grid grid-2">
        <Card title="Learning engine" actions={ls ? <Badge tone={ls.running ? 'amber' : 'grey'} pulse={ls.running}>{ls.running ? 'RUNNING' : 'IDLE'}</Badge> : undefined}>
          <DataState data={learning.data} error={learning.error} loading={learning.loading} reload={learning.reload}>
            {(l) => (
              <>
                <KV
                  items={[
                    ['Last run', fmtTs(l.lastRunAt)],
                    ['Last error', l.error ? <span key="e" className="neg">{l.error}</span> : '—'],
                  ]}
                />
                {l.lastMonitor && l.lastMonitor.length > 0 && (
                  <>
                    <h3>Performance monitor</h3>
                    <Table
                      dense
                      rows={l.lastMonitor}
                      rowKey={(r) => r.mode}
                      columns={[
                        { key: 'mode', header: 'Mode' },
                        { key: 'modelVersion', header: 'Model', render: (r) => <span className="mono">{r.modelVersion ?? '—'}</span> },
                        { key: 'trades', header: 'Trades', align: 'right' },
                        { key: 'expectancyR', header: 'Exp. R', align: 'right', render: (r) => fmtR(r.expectancyR) },
                        { key: 'validatedExpectancyR', header: 'Validated R', align: 'right', render: (r) => fmtR(r.validatedExpectancyR) },
                        { key: 'action', header: 'Action', render: (r) => <Badge tone={r.action === 'ROLLED_BACK' ? 'red' : r.action === 'NONE' ? 'green' : 'grey'}>{r.action}</Badge> },
                      ]}
                    />
                  </>
                )}
                <h3>Progress log</h3>
                {l.progress.length ? <pre className="log">{l.progress.join('\n')}</pre> : <p className="muted small">No progress messages.</p>}
              </>
            )}
          </DataState>
        </Card>
        <Card title="Last verdict">
          {ls?.lastVerdict ? (
            <>
              <div className="row" style={{ marginBottom: 8 }}>
                <PassFail passed={ls.lastVerdict.promote} label={ls.lastVerdict.promote ? 'PROMOTED' : 'NOT PROMOTED'} />
                {ls.lastVerdict.candidateVersion && <span className="mono">candidate {ls.lastVerdict.candidateVersion}</span>}
              </div>
              <Checks checks={ls.lastVerdict.checks} />
              <JsonView value={ls.lastVerdict.summary} summary="OOS summary" />
            </>
          ) : (
            <EmptyState title="No walk-forward verdict yet" />
          )}
        </Card>
      </div>

      <Card title="Model registry">
        <DataState data={models.data} error={models.error} loading={models.loading} reload={models.reload}>
          {(d) => (
            <Table
              rows={d}
              rowKey={(m) => m.version}
              initialSort={{ key: 'createdAt', dir: 'desc' }}
              onRowClick={setDetail}
              emptyTitle="No models registered"
              columns={[
                { key: 'version', header: 'Version', render: (m) => <span className="mono">{m.version}</span> },
                { key: 'status', header: 'Status', render: (m) => <Badge tone={STATUS_TONE[m.status]}>{m.status}</Badge> },
                {
                  key: 'active',
                  header: 'Active',
                  sort: (m) => (m.activeInLive ? 2 : 0) + (m.activeInPaper ? 1 : 0),
                  render: (m) => (
                    <span className="row">
                      {m.activeInPaper && <Badge tone="blue">PAPER</Badge>}
                      {m.activeInLive && <Badge tone="red">LIVE</Badge>}
                      {!m.activeInPaper && !m.activeInLive && <span className="muted">—</span>}
                    </span>
                  ),
                },
                { key: 'parentVersion', header: 'Parent', render: (m) => <span className="mono small">{m.parentVersion ?? '—'}</span> },
                { key: 'createdAt', header: 'Created', render: (m) => fmtTs(m.createdAt) },
                { key: 'validation', header: 'Validation', sortable: false, render: (m) => <ValidationSummary v={m.validation} /> },
                {
                  key: 'actions',
                  header: '',
                  sortable: false,
                  render: (m) => (
                    <span className="row" style={{ flexWrap: 'nowrap' }}>
                      <button
                        type="button"
                        className="btn btn-sm"
                        disabled={m.activeInPaper || m.status === 'REJECTED' || !!busy}
                        onClick={(e) => {
                          e.stopPropagation();
                          setActivate(m);
                        }}
                      >
                        Activate in PAPER
                      </button>
                      <button
                        type="button"
                        className="btn btn-sm btn-danger"
                        disabled={m.activeInLive || m.status === 'REJECTED' || !!busy}
                        onClick={(e) => {
                          e.stopPropagation();
                          setApproveResult(null);
                          setApprove(m);
                        }}
                      >
                        Approve for LIVE
                      </button>
                    </span>
                  ),
                },
              ]}
            />
          )}
        </DataState>
      </Card>

      <Card title="Experiments">
        <DataState data={experiments.data} error={experiments.error} loading={experiments.loading} reload={experiments.reload}>
          {(d) => <ExperimentTimeline items={[...d].sort((a, b) => b.ts - a.ts)} />}
        </DataState>
      </Card>

      <ModelDetail m={detail} onClose={() => setDetail(null)} />

      <ConfirmDialog
        open={!!activate}
        onClose={() => setActivate(null)}
        busy={!!busy}
        title={`Activate ${activate?.version ?? ''} in PAPER`}
        confirmLabel="Activate in PAPER"
        onConfirm={async () => {
          if (!activate) return;
          const r = await run('Activate in PAPER', () => api.activatePaper(activate.version), () => `${activate.version} is now active in PAPER`);
          if (r) {
            setActivate(null);
            reloadAll();
          }
        }}
      >
        <p>The PAPER engine will use this model for new decisions. LIVE is unaffected.</p>
      </ConfirmDialog>

      <ConfirmDialog
        open={!!approve}
        onClose={() => setApprove(null)}
        danger
        busy={!!busy}
        title={`Approve ${approve?.version ?? ''} for LIVE`}
        confirmLabel="Approve for LIVE"
        requireText={approve ? `APPROVE ${approve.version}` : undefined}
        onConfirm={async () => {
          if (!approve) return;
          const r = await run(
            'Approve for LIVE',
            () => api.approveLive(approve.version, `APPROVE ${approve.version}`),
            (x) => (x.approved ? `${approve.version} approved for LIVE` : `${approve.version} NOT approved: readiness checks failed`),
          );
          if (r) {
            setApproveResult({ approved: r.approved, checks: asChecks(r.checks) });
            reloadAll();
          }
        }}
      >
        <p>
          The engine evaluates PAPER trade evidence for this exact version; approval is refused if the evidence is insufficient. Approval does not arm LIVE
          trading by itself.
        </p>
        {approveResult && (
          <>
            <div style={{ margin: '8px 0' }}>
              <PassFail passed={approveResult.approved} label={approveResult.approved ? 'APPROVED' : 'DENIED'} />
            </div>
            <Checks checks={approveResult.checks} />
          </>
        )}
      </ConfirmDialog>

      <ConfirmDialog
        open={!!rollbackMode}
        onClose={() => setRollbackMode(null)}
        danger={rollbackMode === 'LIVE'}
        busy={!!busy}
        title={`Rollback ${rollbackMode ?? ''} model`}
        confirmLabel={`Rollback ${rollbackMode ?? ''}`}
        onConfirm={async () => {
          if (!rollbackMode) return;
          const m = rollbackMode;
          const r = await run(`Rollback ${m}`, () => api.rollback(m, 'manual rollback (dashboard)'), (x) => (x.ok ? `${m} rolled back to ${x.rolledBackTo}` : `No previous ${m} model to roll back to`));
          if (r) {
            setRollbackMode(null);
            reloadAll();
          }
        }}
      >
        <p>
          Reverts the active {rollbackMode} model to its previous version (current model:{' '}
          <span className="mono">{(rollbackMode === 'LIVE' ? status?.models.live : status?.models.paper) ?? 'none'}</span>). This is audited.
        </p>
      </ConfirmDialog>
    </>
  );
}
