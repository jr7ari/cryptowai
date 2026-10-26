import type { RegimeName } from './types';
import { REGIMES } from './types';

/** One fixed color per regime, used everywhere (badges, bands, charts). */
export const REGIME_COLORS: Record<RegimeName, string> = {
  STRONG_UPTREND: '#22c55e',
  STRONG_DOWNTREND: '#ef4444',
  RANGING: '#60a5fa',
  HIGH_VOLATILITY: '#f59e0b',
  LOW_VOLATILITY: '#a78bfa',
  BREAKOUT: '#2dd4bf',
  BREAKDOWN: '#f97316',
  REVERSAL_BULLISH: '#84cc16',
  REVERSAL_BEARISH: '#ec4899',
  CHOPPY: '#94a3b8',
};

export const REGIME_SHORT: Record<RegimeName, string> = {
  STRONG_UPTREND: 'Uptrend',
  STRONG_DOWNTREND: 'Downtrend',
  RANGING: 'Ranging',
  HIGH_VOLATILITY: 'High vol',
  LOW_VOLATILITY: 'Low vol',
  BREAKOUT: 'Breakout',
  BREAKDOWN: 'Breakdown',
  REVERSAL_BULLISH: 'Bull reversal',
  REVERSAL_BEARISH: 'Bear reversal',
  CHOPPY: 'Choppy',
};

export function regimeColor(r: string | null | undefined): string {
  return (r && REGIME_COLORS[r as RegimeName]) || '#64748b';
}

export function regimeLabel(r: string | null | undefined): string {
  return (r && REGIME_SHORT[r as RegimeName]) || r || '—';
}

export function regimeIndex(r: string): number {
  return (REGIMES as readonly string[]).indexOf(r);
}

/** Diverging color for a signed value scaled to +-max: red (neg) -> neutral -> green (pos). */
export function divergingColor(v: number, max: number): string {
  if (!Number.isFinite(v) || max <= 0) return 'transparent';
  const a = Math.min(1, Math.abs(v) / max);
  return v >= 0 ? `rgba(34, 197, 94, ${0.12 + a * 0.6})` : `rgba(239, 68, 68, ${0.12 + a * 0.6})`;
}

/** Sequential amber scale for 0..1 values. */
export function sequentialColor(v: number): string {
  if (!Number.isFinite(v) || v <= 0) return 'transparent';
  return `rgba(245, 158, 11, ${0.1 + Math.min(1, v) * 0.7})`;
}
