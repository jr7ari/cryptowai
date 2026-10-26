'use client';

import { api } from '@/lib/api';
import { fmtAge, fmtFrac, fmtMoney, fmtNum, fmtPct, fmtPrice, fmtR, fmtTs, humanize, pnlClass } from '@/lib/format';
import { AlphaSignals, hasAlpha } from './alpha';
import { usePoll } from '@/lib/hooks';
import type { DecisionDetail, Evaluation, StrategyCandidate } from '@/lib/types';
import { Modal } from './Modal';
import { Table } from './Table';
import { ActionBadge } from './trading';
import { Badge, Card, DataState, JsonView, KV, PassFail, RegimeBadge } from './ui';

/** Risk-check values arrive as raw floats: show them with sensible precision. */
function fmtCheckValue(v: number | string): string {
  if (typeof v !== 'number') return String(v);
  if (!Number.isFinite(v)) return '—';
  if (Number.isInteger(v)) return fmtNum(v, 0);
  const a = Math.abs(v);
  return fmtNum(v, a >= 100 ? 2 : a >= 1 ? 3 : 4);
}

function EvaluationView({ e }: { e: Evaluation }) {
  // trend sleeves use a 1e9 "never" take-profit, which the evaluator turns into an absurd max profit
  const uncapped = e.maxProfit === null || (e.rewardRisk !== null && e.rewardRisk > 1000);
  return (
    <div className="grid grid-2">
      <KV
        items={[
          ['Net expected value', <span key="ev" className={pnlClass(e.expectedValue)}>{fmtMoney(e.expectedValue, { sign: true })}</span>],
          ['Gross EV (before taker costs)', <span key="gev" className={pnlClass(e.grossExpectedValue)}>{fmtMoney(e.grossExpectedValue, { sign: true })}</span>],
          ['EV / risk', <span key="evr" className={pnlClass(e.evPerRisk)}>{fmtR(e.evPerRisk)}</span>],
          ['Prob. of profit', fmtFrac(e.probabilityOfProfit)],
          ['Prob. touch target', fmtFrac(e.probTouchTarget)],
          ['Net premium', fmtMoney(e.netPremium)],
          ['Max loss', fmtMoney(e.maxLoss)],
          ['Max profit', uncapped ? 'unbounded (no take-profit)' : fmtMoney(e.maxProfit)],
          ['Reward / risk', uncapped ? '∞' : e.rewardRisk === null ? '—' : fmtNum(e.rewardRisk, 2)],
          ['Breakevens', e.breakevens.length ? e.breakevens.map((b) => fmtNum(b, 2)).join(', ') : '—'],
          ['Horizon', `${fmtNum(e.horizonDays, 1)} d`],
          ['IV used / forecast vol', `${fmtFrac(e.ivUsed)} / ${fmtFrac(e.forecastVol)}`],
          [
            <span key="t" title="EV if held to the horizon with no exits (terminal distribution mean)">Terminal EV (hold to horizon)</span>,
            <span key="tv" className={pnlClass(e.terminalExpectedValue)}>{fmtMoney(e.terminalExpectedValue, { sign: true })}</span>,
          ],
        ]}
      />
      <div>
        <KV
          items={[
            ['Delta', fmtNum(e.greeks.delta, 4)],
            ['Gamma', fmtNum(e.greeks.gamma, 6)],
            ['Vega', fmtNum(e.greeks.vega, 4)],
            ['Theta', fmtNum(e.greeks.theta, 4)],
            ['Costs total', fmtMoney(e.costs.total)],
            ['Fees / slippage', `${fmtMoney(e.costs.fees)} / ${fmtMoney(e.costs.slippage)}`],
            ['Spread cost / funding', `${fmtMoney(e.costs.spreadCost)} / ${fmtMoney(e.costs.funding)}`],
            ['Liquidity score', fmtNum(e.liquidityScore, 2)],
            ['Widest leg spread', fmtPct(e.spreadPct)],
            ['Margin required', fmtMoney(e.marginRequired)],
          ]}
        />
        {e.path && (
          <>
            <h3>Path simulation (Monte-Carlo, {fmtNum(e.path.paths, 0)} paths)</h3>
            <KV
              items={[
                ['Stop-loss hit', fmtFrac(e.path.stopHitPct)],
                ['Take-profit hit', fmtFrac(e.path.takeProfitPct)],
                ['Trailing-stop exit', fmtFrac(e.path.trailingPct)],
                ['Time exit', fmtFrac(e.path.timeExitPct)],
                ['P&L p5 / p95', <span key="pp"><span className={pnlClass(e.path.p5)}>{fmtMoney(e.path.p5, { sign: true })}</span> / <span className={pnlClass(e.path.p95)}>{fmtMoney(e.path.p95, { sign: true })}</span></span>],
                ['Mean ± stderr', e.path.meanStderr !== undefined ? `${fmtMoney(e.path.mean ?? e.expectedValue, { sign: true })} ± ${fmtMoney(e.path.meanStderr)}` : '—'],
                ['Seed', e.path.seed !== undefined ? String(e.path.seed) : '—'],
              ]}
            />
          </>
        )}
        {e.terminalExpectedValue !== undefined && (
          <p className="muted small" style={{ marginTop: 8 }}>
            Expected value {fmtMoney(e.expectedValue, { sign: true })} includes the exit rules (stops, targets, trailing, time) simulated along price paths; terminal EV{' '}
            {fmtMoney(e.terminalExpectedValue, { sign: true })} assumes holding to the horizon. Difference:{' '}
            <span className={pnlClass(e.expectedValue - e.terminalExpectedValue)}>{fmtMoney(e.expectedValue - e.terminalExpectedValue, { sign: true })}</span> from exit management.
          </p>
        )}
      </div>
    </div>
  );
}

function CandidateBlock({ c, selected }: { c: StrategyCandidate; selected: boolean }) {
  return (
    <details className="card" style={{ marginBottom: 8 }} open={selected}>
      <summary className="card-head" style={{ cursor: 'pointer' }}>
        <div className="row">
          <strong>{humanize(c.strategy)}</strong>
          {selected && <Badge tone="purple">SELECTED</Badge>}
          <PassFail passed={c.eligible} label={c.eligible ? 'ELIGIBLE' : 'REJECTED'} />
          <span className="muted small">
            score {fmtNum(c.score, 4)} · affinity {fmtNum(c.regimeAffinity, 2)} · legs {Array.isArray(c.legs) ? c.legs.length : c.legs}
          </span>
        </div>
      </summary>
      <div className="card-body">
        {c.rejectedReasons.length > 0 && (
          <ul className="bullets">
            {c.rejectedReasons.map((r, i) => (
              <li key={i} className="neg">
                {r}
              </li>
            ))}
          </ul>
        )}
        {c.evaluation ? <EvaluationView e={c.evaluation} /> : <p className="muted">No evaluation (filtered before pricing).</p>}
        {Array.isArray(c.legs) && c.legs.length > 0 && (
          <>
            <h3>Legs</h3>
            <Table
              dense
              rows={c.legs}
              rowKey={(_, i) => String(i)}
              columns={[
                { key: 'side', header: 'Side', render: (l) => <Badge tone={l.side === 'BUY' ? 'green' : 'red'}>{l.side}</Badge> },
                { key: 'instrument', header: 'Instrument', render: (l) => <span className="mono">{l.instrument}</span> },
                { key: 'qty', header: 'Qty', align: 'right', render: (l) => fmtNum(l.qty, 4) },
                { key: 'bid', header: 'Bid', align: 'right', render: (l) => fmtNum(l.bid, 2) },
                { key: 'ask', header: 'Ask', align: 'right', render: (l) => fmtNum(l.ask, 2) },
                { key: 'iv', header: 'IV', align: 'right', render: (l) => fmtFrac(l.option?.iv) },
              ]}
            />
          </>
        )}
        <JsonView value={c.params} summary="Parameters" />
      </div>
    </details>
  );
}

function DecisionBody({ d }: { d: DecisionDetail }) {
  const ev = d.regime?.evidence?.[d.regime.primary] ?? [];
  return (
    <div className="stack">
      <div className="row">
        <ActionBadge action={d.action} />
        <Badge tone={d.mode === 'LIVE' ? 'red' : 'blue'}>{d.mode}</Badge>
        <span className="mono">{d.symbol}</span>
        <RegimeBadge regime={d.regime?.primary} confidence={d.regime?.confidence} />
        <span className="muted small">
          {fmtTs(d.ts)} · model {d.modelVersion}
        </span>
      </div>
      <Card title="Rationale">
        <p style={{ margin: 0 }}>{d.rationale}</p>
      </Card>
      {(d.action === 'NO_TRADE' || d.action === 'BLOCKED' || d.action === 'HOLDING') && (
        <Card title={d.action === 'HOLDING' ? 'Already in this trade' : `${d.action} reason`}>
          <p style={{ margin: 0 }}>
            {d.rationale ||
              (d.action === 'HOLDING'
                ? 'A valid candidate is already open on this underlying (max 1). Exits stay with the position monitor.'
                : 'No candidate passed filters (explicit NO_TRADE).')}
          </p>
        </Card>
      )}
      {d.outcome && (
        <Card title="Outcome">
          <KV
            items={[
              ['Realized P&L', <span key="p" className={pnlClass(d.outcome.realizedPnl)}>{fmtMoney(d.outcome.realizedPnl, { sign: true })}</span>],
              ['Return on risk', fmtR(d.outcome.returnOnRisk)],
              ['Exit reason', d.outcome.exitReason],
              ['Closed', fmtTs(d.outcome.ts)],
            ]}
          />
        </Card>
      )}
      <Card title="Risk checks">
        {d.riskChecks.length ? (
          <ul className="checklist">
            {d.riskChecks.map((c, i) => (
              <li key={i}>
                <PassFail passed={c.passed} />
                <span className="ck-name">{c.name}</span>
                <span className="ck-detail">
                  {c.message}
                  {c.value !== undefined && (
                    <span className="muted">
                      {' '}
                      ({fmtCheckValue(c.value)}
                      {c.limit !== undefined ? ` / limit ${fmtCheckValue(c.limit)}` : ''})
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">No risk checks recorded (no candidate reached sizing).</p>
        )}
      </Card>
      <Card title="Regime">
        <div className="row" style={{ marginBottom: 6 }}>
          <span>Direction: {d.regime?.direction}</span>
          <span>Vol: {d.regime?.volState}</span>
          {d.regime?.sticky && <Badge tone="amber">STICKY</Badge>}
          {d.regime?.primary && d.regime.probabilities?.[d.regime.primary] !== undefined && (
            <span className="muted small">
              P({d.regime.primary}) {fmtFrac(d.regime.probabilities[d.regime.primary])} · score-confidence {fmtFrac(d.regime.confidence)} (not a calibrated probability)
            </span>
          )}
        </div>
        {ev.length > 0 && (
          <ul className="bullets">
            {ev.map((x, i) => (
              <li key={i}>{x}</li>
            ))}
          </ul>
        )}
      </Card>
      <Card title={`Candidates (${d.candidates.length})`}>
        {d.candidates.map((c, i) => (
          <CandidateBlock key={`${c.strategy}-${i}`} c={c} selected={c.strategy === d.selected} />
        ))}
      </Card>
      {hasAlpha(d.snapshot.features) && (
        <Card title="Alpha decomposition at decision time">
          <AlphaSignals f={d.snapshot.features} compact />
        </Card>
      )}
      <Card title="Market snapshot">
        <KV
          items={[
            ['Spot', fmtPrice(d.snapshot.spot)],
            ['Mark', fmtPrice(d.snapshot.mark)],
            ['Bid / Ask', `${fmtPrice(d.snapshot.bid)} / ${fmtPrice(d.snapshot.ask)}`],
            [
              'Funding (8h)',
              d.snapshot.fundingRate !== undefined ? `${fmtFrac(d.snapshot.fundingRate, { dp: 4, sign: true })} · ${fmtFrac(d.snapshot.fundingRate * 3 * 365, { sign: true })}/yr` : '—',
            ],
            ['Data age', fmtAge(d.snapshot.dataAgeMs)],
            ['Model version', d.modelVersion],
          ]}
        />
        {d.snapshot.dataQuality && (
          <>
            <h3>Data quality</h3>
            <KV
              items={[
                ['Safe to trade (fresh + bars)', d.snapshot.dataQuality.ok ? 'yes' : 'no'],
                ['Closed bars', fmtNum(d.snapshot.dataQuality.candleBars, 0)],
                ['Book imbalance', d.snapshot.dataQuality.bookImbalanceAvail ? 'live' : 'unavailable'],
                ['OFI (sequenced L2)', d.snapshot.dataQuality.ofiAvail ? 'live' : 'unavailable (not stored historically)'],
                ['Funding / OI / IV / CUSUM', `${d.snapshot.dataQuality.fundingAvail ? 'F' : '—'} / ${d.snapshot.dataQuality.oiAvail ? 'OI' : '—'} / ${d.snapshot.dataQuality.ivAvail ? 'IV' : '—'} / ${d.snapshot.dataQuality.cusumAvail ? 'C' : '—'}`],
              ]}
            />
            {d.snapshot.dataQuality.reasons.length > 0 && (
              <ul className="bullets">
                {d.snapshot.dataQuality.reasons.map((r, i) => (
                  <li key={i} className="muted">
                    {r}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
        {(d.snapshot.features.disagreementCount ?? 0) > 0 && (
          <p className="muted small">Feature disagreement count {fmtNum(d.snapshot.features.disagreementCount, 0)} — correlated trend indicators are not independent evidence.</p>
        )}
        <JsonView value={d.snapshot.features} summary="Snapshot features" />
        {d.snapshot.chainMetrics && <JsonView value={d.snapshot.chainMetrics} summary="Chain metrics" />}
      </Card>
      {d._ledger && <p className="muted small mono">ledger seq {d._ledger.seq} · hash {d._ledger.hash.slice(0, 16)}…</p>}
    </div>
  );
}

export function DecisionDrawer({ id, onClose }: { id: string | null; onClose: () => void }) {
  const q = usePoll(id ? `decision:${id}` : null, () => api.decision(id!));
  return (
    <Modal open={!!id} onClose={onClose} title={`Decision ${id?.slice(0, 8) ?? ''}`} variant="drawer">
      <DataState data={q.data} error={q.error} loading={q.loading} reload={q.reload}>
        {(d) => <DecisionBody d={d} />}
      </DataState>
    </Modal>
  );
}
