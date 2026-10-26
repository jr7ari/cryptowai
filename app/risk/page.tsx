'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { fmtMoney, fmtNum, fmtTs, humanize, pnlClass, shortId } from '@/lib/format';
import { usePoll } from '@/lib/hooks';
import type { RiskResponse } from '@/lib/types';
import { EngageKillSwitchDialog, ReleaseKillSwitchDialog } from '@/components/KillSwitch';
import { useEngine } from '@/components/providers';
import { Table } from '@/components/Table';
import { ExitPlanCell } from '@/components/trading';
import { Badge, Card, DataState, KV, PageHeader, UtilBar } from '@/components/ui';

const LIMIT_HELP: Record<string, string> = {
  capital: 'Reference capital for sizing',
  maxRiskPerTradePct: 'Max loss per trade as % of equity',
  dailyLossLimitPct: 'Daily loss that halts trading until next UTC day',
  maxDrawdownPct: 'Peak-to-trough drawdown that engages the kill switch and flattens',
  maxOpenPositions: 'Concurrent open positions',
  maxPositionsPerUnderlying: 'Concurrent positions per underlying',
  maxTotalPremiumAtRiskPct: 'Sum of max losses of open positions as % of equity',
  maxNotionalExposurePct: 'Gross notional exposure as % of equity',
  maxNetDeltaPctOfCapital: 'Net delta exposure as % of capital',
  maxLeverage: 'Futures leverage cap',
  maxSpreadPct: 'Widest acceptable bid/ask spread',
  minOpenInterest: 'Minimum open interest per leg',
  minLiquidityScore: 'Minimum liquidity score',
  staleDataMs: 'Market data older than this blocks entries',
  minConfidence: 'Minimum regime confidence to trade',
  minExpectedValuePerRisk: 'Minimum EV / max loss',
  minProbabilityOfProfit: 'Minimum probability of profit',
  maxConsecutiveLosses: 'Consecutive losses before cooldown',
  cooldownAfterLossMin: 'Cooldown after a loss (minutes)',
  maxOrdersPerMinute: 'Order rate limit',
  minDaysToExpiry: 'Minimum option DTE',
  maxDaysToExpiry: 'Maximum option DTE',
};

function flattenLimits(l: RiskResponse['limits']): Array<{ key: string; value: number | string }> {
  const out: Array<{ key: string; value: number | string }> = [];
  for (const [k, v] of Object.entries(l ?? {})) {
    if (v && typeof v === 'object') for (const [k2, v2] of Object.entries(v)) out.push({ key: `${k}.${k2}`, value: v2 as number });
    else out.push({ key: k, value: v as number });
  }
  return out;
}

export default function RiskPage() {
  const { positionTick, status } = useEngine();
  const risk = usePoll('risk', api.risk, 10_000);
  const [engage, setEngage] = useState(false);
  const [release, setRelease] = useState(false);
  useEffect(() => {
    if (positionTick) void risk.reload();
    // risk.reload is stable (useCallback with no deps)
  }, [positionTick]);
  // keep kill switch panel in sync with the stream
  const ks = status?.killSwitch ?? risk.data?.killSwitch;

  return (
    <>
      <PageHeader title="Risk monitor">{risk.data && <Badge tone={risk.data.mode === 'LIVE' ? 'red' : 'blue'}>{risk.data.mode} limits</Badge>}</PageHeader>
      <DataState data={risk.data} error={risk.error} loading={risk.loading} reload={risk.reload}>
        {(r) => (
          <>
            <div className="grid grid-2">
              <Card title="Utilisation" subtitle="amber > 70% · red > 90% of the hard limit">
                <UtilBar label="Daily loss" value={r.utilisation.dailyLossPct.value} limit={r.utilisation.dailyLossPct.limit} format={(v) => `${v.toFixed(2)}%`} />
                <UtilBar label="Drawdown" value={r.utilisation.drawdownPct.value} limit={r.utilisation.drawdownPct.limit} format={(v) => `${v.toFixed(2)}%`} />
                <UtilBar label="Open positions" value={r.utilisation.openPositions.value} limit={r.utilisation.openPositions.limit} format={(v) => v.toFixed(0)} />
                <UtilBar label="Premium at risk" value={r.utilisation.premiumAtRiskPct.value} limit={r.utilisation.premiumAtRiskPct.limit} format={(v) => `${v.toFixed(2)}%`} />
                <UtilBar label="Consecutive losses" value={r.utilisation.consecutiveLosses.value} limit={r.utilisation.consecutiveLosses.limit} format={(v) => v.toFixed(0)} />
              </Card>
              <Card title="Kill switch" className={ks?.engaged ? 'card-danger' : ''}>
                {ks && (
                  <KV
                    items={[
                      ['State', ks.engaged ? <Badge key="s" tone="red">ENGAGED</Badge> : <Badge key="s" tone="green">OFF</Badge>],
                      ['Kind', ks.kind ?? '—'],
                      ['Reason', ks.reason ?? '—'],
                      ['Engaged at', fmtTs(ks.engagedAt)],
                      ['Engaged by', ks.engagedBy ?? '—'],
                      ['Flatten', ks.flatten ? 'yes' : 'no'],
                      ['Auto release', ks.autoReleaseAt ? fmtTs(ks.autoReleaseAt) : 'operator only'],
                    ]}
                  />
                )}
                <div className="row" style={{ marginTop: 12 }}>
                  <button type="button" className="btn btn-danger" onClick={() => setEngage(true)}>
                    Engage…
                  </button>
                  <button type="button" className="btn" disabled={!ks?.engaged} onClick={() => setRelease(true)}>
                    Release…
                  </button>
                </div>
                <p className="muted small" style={{ marginTop: 10 }}>
                  Engaging is always allowed. PAPER release works from the dashboard; LIVE release needs the operator token.
                </p>
              </Card>
            </div>
            <Card title="Open position risk">
              <Table
                rows={r.openPositions}
                rowKey={(p) => p.id}
                initialSort={{ key: 'maxLoss', dir: 'desc' }}
                emptyTitle="No open positions"
                columns={[
                  { key: 'id', header: 'ID', render: (p) => <span className="mono small">{shortId(p.id)}</span> },
                  { key: 'underlying', header: 'Underlying', render: (p) => <span className="mono">{p.underlying}</span> },
                  { key: 'strategy', header: 'Strategy', render: (p) => humanize(p.strategy) },
                  { key: 'maxLoss', header: 'Max loss', align: 'right', render: (p) => <span className="neg">{fmtMoney(p.maxLoss)}</span> },
                  { key: 'lastMarkPnl', header: 'Mark P&L', align: 'right', render: (p) => <span className={pnlClass(p.lastMarkPnl)}>{fmtMoney(p.lastMarkPnl, { sign: true })}</span> },
                  { key: 'exitPlan', header: 'Exit plan', sortable: false, className: 'wrap', render: (p) => <ExitPlanCell plan={p.exitPlan} /> },
                ]}
              />
            </Card>
            <Card title="Hard limits" subtitle="Immutable at runtime; the learning engine cannot change these">
              <Table
                dense
                rows={flattenLimits(r.limits)}
                rowKey={(x) => x.key}
                columns={[
                  { key: 'key', header: 'Limit', render: (x) => <span className="mono">{x.key}</span> },
                  { key: 'value', header: 'Value', align: 'right', render: (x) => <span className="mono">{typeof x.value === 'number' ? fmtNum(x.value, Number.isInteger(x.value) ? 0 : 2) : String(x.value)}</span> },
                  { key: 'help', header: 'Meaning', sortable: false, className: 'wrap', render: (x) => <span className="muted">{LIMIT_HELP[x.key] ?? (x.key.startsWith('exits.') ? 'Default exit rule' : '')}</span> },
                ]}
              />
            </Card>
          </>
        )}
      </DataState>
      <EngageKillSwitchDialog
        open={engage}
        onClose={() => {
          setEngage(false);
          void risk.reload();
        }}
      />
      <ReleaseKillSwitchDialog
        open={release}
        onClose={() => {
          setRelease(false);
          void risk.reload();
        }}
      />
    </>
  );
}
