'use client';

/** Alpha-signal panel: drift decomposition, TSMOM horizons, VRP and vol-target sizing. */
import type { ReactNode } from 'react';
import { fmtFrac, fmtNum, fmtScore } from '@/lib/format';
import type { FeatureVector } from '@/lib/types';
import { Badge, type BadgeTone } from './ui';

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

export const MOM_HORIZONS = [1, 3, 7, 14, 28] as const;

/** Horizontal diverging bar centred on zero, scaled to +-max. */
export function DivBar({ value, max, label }: { value: number | undefined; max: number; label?: string }) {
  const v = isNum(value) ? value : 0;
  const w = Math.min(50, (Math.abs(v) / (max || 1)) * 50);
  return (
    <div className="divbar" role="img" aria-label={label ?? `value ${v}`}>
      <span className="divbar-mid" aria-hidden />
      {isNum(value) && <span className={`divbar-fill ${v >= 0 ? 'pos' : 'neg'}`} style={v >= 0 ? { left: '50%', width: `${w}%` } : { right: '50%', width: `${w}%` }} />}
    </div>
  );
}

function tone(v: number | undefined, eps: number): BadgeTone {
  if (!isNum(v)) return 'grey';
  return v > eps ? 'green' : v < -eps ? 'red' : 'grey';
}

function Row({ name, value, bar, explain }: { name: ReactNode; value: ReactNode; bar?: ReactNode; explain: ReactNode }) {
  return (
    <div className="alpha-row">
      <div className="alpha-name">{name}</div>
      <div className="alpha-val mono">{value}</div>
      <div className="alpha-bar">{bar}</div>
      <div className="alpha-explain">{explain}</div>
    </div>
  );
}

/** true when the features contain any alpha/TSMOM signal at all */
export function hasAlpha(f: FeatureVector | undefined | null): boolean {
  if (!f) return false;
  return ['alphaDrift', 'tsmom', 'vrpScore', 'volTargetScale', ...MOM_HORIZONS.map((h) => `mom_t_${h}d`)].some((k) => isNum(f[k]));
}

export function AlphaSignals({ f, compact }: { f: FeatureVector; compact?: boolean }) {
  const drift = f.alphaDrift;
  const parts: Array<[string, number | undefined, string]> = [
    ['Regime', f.alphaRegime, 'Drift the current regime has historically implied, weighted by confidence'],
    ['Momentum', f.alphaMomentum, 'Trend-following drift from the TSMOM score, scaled by volatility'],
    ['Funding', f.alphaFunding, 'Small contrarian tilt against the crowded side of the perpetual funding'],
  ];
  const partMax = Math.max(0.05, ...parts.map(([, v]) => (isNum(v) ? Math.abs(v) : 0)), isNum(drift) ? Math.abs(drift) : 0);
  const vrp = f.ivAtm > 0 ? f.vrpScore : undefined;
  const vrpText = !isNum(vrp)
    ? 'needs an option chain'
    : vrp > 0.1
      ? 'implied vol is rich vs forecast: favours selling defined-risk premium'
      : vrp < -0.1
        ? 'implied vol is cheap vs forecast: favours buying options'
        : 'implied vol is roughly fair vs forecast: no premium edge';
  const scale = f.volTargetScale;
  const tStats = MOM_HORIZONS.map((h) => ({ h, t: f[`mom_t_${h}d`] }));
  const tMax = Math.max(2.5, ...tStats.map((x) => (isNum(x.t) ? Math.abs(x.t) : 0)));

  return (
    <div className="alpha">
      <div className="alpha-grid">
        <Row
          name={<strong>Alpha drift</strong>}
          value={
            <Badge tone={tone(drift, 0.05)}>
              {isNum(drift) ? `${drift > 0 ? '+' : ''}${fmtFrac(drift)}/yr` : '—'}
            </Badge>
          }
          bar={<DivBar value={drift} max={partMax} label="Alpha drift" />}
          explain="Expected annual drift the engine assumes for the underlying (sum of the three parts below)."
        />
        {parts.map(([n, v, e]) => (
          <Row
            key={n}
            name={<span className="alpha-sub">↳ {n}</span>}
            value={<span className={isNum(v) ? (v > 0 ? 'pos' : v < 0 ? 'neg' : '') : 'muted'}>{isNum(v) ? `${v > 0 ? '+' : ''}${fmtFrac(v)}/yr` : '—'}</span>}
            bar={<DivBar value={v} max={partMax} label={`${n} contribution`} />}
            explain={e}
          />
        ))}
        <Row
          name={<strong>TSMOM score</strong>}
          value={<Badge tone={tone(f.tsmom, 0.15)}>{fmtScore(f.tsmom)}</Badge>}
          bar={<DivBar value={f.tsmom} max={1} label="TSMOM score" />}
          explain={
            <>
              Multi-horizon trend strength in [-1, 1]; above +0.15 is a bullish trend, below -0.15 bearish.
              {isNum(f.tsmomAgreement) && <> Horizons agreeing: {fmtFrac(f.tsmomAgreement, { dp: 0 })}.</>}
            </>
          }
        />
        <Row
          name={<strong>VRP score</strong>}
          value={<Badge tone={!isNum(vrp) ? 'grey' : vrp > 0.1 ? 'amber' : vrp < -0.1 ? 'blue' : 'grey'}>{fmtScore(vrp)}</Badge>}
          bar={<DivBar value={vrp} max={1} label="VRP score" />}
          explain={`Variance risk premium in [-1, 1]: ${vrpText}.`}
        />
        <Row
          name={<strong>Vol-target size</strong>}
          value={<span>{isNum(scale) ? `${fmtNum(scale, 2)}×` : '—'}</span>}
          bar={
            <div className="divbar" aria-hidden>
              {isNum(scale) && <span className="divbar-fill info" style={{ left: 0, width: `${Math.min(100, scale * 100)}%` }} />}
            </div>
          }
          explain={
            <>
              Position-size multiplier (≤ 1×): size shrinks when forecast volatility exceeds the target.
              {isNum(f.forecastVol) && <> Forecast vol {fmtFrac(f.forecastVol)}.</>}
            </>
          }
        />
      </div>

      {!compact || tStats.some((x) => isNum(x.t)) ? (
        <>
          <h3>Momentum t-stats by horizon</h3>
          <div className="tstats">
            {tStats.map(({ h, t }) => (
              <div key={h} className="tstat">
                <div className="tstat-h">{h}d</div>
                <div className="tstat-bar">
                  <span className="tstat-zero" aria-hidden />
                  <span className="tstat-sig" style={{ bottom: `${50 + (2 / tMax) * 50}%` }} aria-hidden />
                  <span className="tstat-sig" style={{ bottom: `${50 - (2 / tMax) * 50}%` }} aria-hidden />
                  {isNum(t) && (
                    <span
                      className={`tstat-fill ${t >= 0 ? 'pos' : 'neg'}`}
                      style={t >= 0 ? { bottom: '50%', height: `${(Math.abs(t) / tMax) * 50}%` } : { top: '50%', height: `${(Math.abs(t) / tMax) * 50}%` }}
                    />
                  )}
                </div>
                <div className={`tstat-v mono ${isNum(t) ? (Math.abs(t) >= 2 ? (t > 0 ? 'pos' : 'neg') : '') : 'muted'}`}>{isNum(t) ? fmtScore(t) : '—'}</div>
              </div>
            ))}
          </div>
          <p className="muted small" style={{ margin: '4px 0 0' }}>
            t-stat of the trailing return over each horizon (return ÷ its volatility). |t| ≥ 2 (dashed lines) is a statistically meaningful trend.
          </p>
        </>
      ) : null}
      <p className="alpha-disclaimer small">
        These are evidence-based priors (time-series momentum, variance risk premium, funding carry, volatility targeting) whose weights are re-validated
        out-of-sample by the walk-forward promotion gate. They tilt selection and sizing; they are not guarantees of profit.
      </p>
    </div>
  );
}
