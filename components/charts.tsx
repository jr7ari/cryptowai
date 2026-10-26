'use client';

import type { ReactNode } from 'react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { fmtAxisTime, fmtMoney, fmtTs } from '@/lib/format';

export const AXIS = {
  stroke: '#3a4555',
  tick: { fill: '#8392a5', fontSize: 11 },
  tickLine: false,
} as const;
export const GRID = { stroke: '#1d242e', strokeDasharray: '3 3' } as const;
export const TOOLTIP_STYLE = {
  contentStyle: { background: '#1b212b', border: '1px solid #2d3746', borderRadius: 5, fontSize: 12 },
  labelStyle: { color: '#9aa6b6' },
  itemStyle: { padding: 0 },
} as const;

/** Distinct colors for overlaid series (backtest comparisons etc.). */
export const SERIES_COLORS = ['#f59e0b', '#60a5fa', '#22c55e', '#ec4899', '#a78bfa', '#2dd4bf', '#f97316', '#94a3b8'];

export function ChartBox({ height = 260, children, label }: { height?: number; children: ReactNode; label: string }) {
  return (
    <div className="chart" style={{ height }} role="img" aria-label={label}>
      {children}
    </div>
  );
}

export function EquityChart({ points, height = 260, color = '#22c55e' }: { points: Array<{ ts: number; equity: number }>; height?: number; color?: string }) {
  const first = points[0]?.equity ?? 0;
  const last = points[points.length - 1]?.equity ?? 0;
  const c = last >= first ? color : '#ef4444';
  const gid = `eq-${c.replace('#', '')}`;
  return (
    <ChartBox height={height} label="Equity curve">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={c} stopOpacity={0.35} />
              <stop offset="100%" stopColor={c} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid {...GRID} vertical={false} />
          <XAxis dataKey="ts" type="number" domain={['dataMin', 'dataMax']} scale="time" tickFormatter={fmtAxisTime} minTickGap={40} {...AXIS} />
          <YAxis domain={['auto', 'auto']} width={70} tickFormatter={(v: number) => fmtMoney(v)} {...AXIS} />
          <Tooltip {...TOOLTIP_STYLE} labelFormatter={(v) => fmtTs(Number(v))} formatter={(v) => [fmtMoney(Number(v)), 'Equity']} />
          <Area type="monotone" dataKey="equity" stroke={c} strokeWidth={1.6} fill={`url(#${gid})`} isAnimationActive={false} dot={false} />
        </AreaChart>
      </ResponsiveContainer>
    </ChartBox>
  );
}

/** Semi-circular confidence gauge (0..1). */
export function Gauge({ value, color }: { value: number; color: string }) {
  const v = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  const r = 46;
  const cx = 55;
  const cy = 55;
  const arc = (a: number) => {
    const ang = Math.PI * (1 - a);
    return `${cx + r * Math.cos(ang)} ${cy - r * Math.sin(ang)}`;
  };
  return (
    <div className="gauge" role="meter" aria-label="Regime confidence" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(v * 100)}>
      <svg width="110" height="60" viewBox="0 0 110 60" aria-hidden>
        <path d={`M ${arc(0)} A ${r} ${r} 0 0 1 ${arc(1)}`} stroke="#222a35" strokeWidth="9" fill="none" strokeLinecap="round" />
        {v > 0 && <path d={`M ${arc(0)} A ${r} ${r} 0 0 1 ${arc(v)}`} stroke={color} strokeWidth="9" fill="none" strokeLinecap="round" />}
      </svg>
      <div className="gauge-val" style={{ color }}>
        {(v * 100).toFixed(0)}%
      </div>
    </div>
  );
}
