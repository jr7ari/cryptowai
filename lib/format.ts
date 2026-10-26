/** Number / time formatting helpers. All functions tolerate null/undefined/NaN and return an em dash. */

const DASH = '—';

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

export function fmtNum(v: number | null | undefined, dp = 2): string {
  if (!isNum(v)) return DASH;
  return v.toLocaleString(undefined, { minimumFractionDigits: dp, maximumFractionDigits: dp });
}

/** Currency with 2 dp. The engine accounts in the margin currency (USDT by default). */
export function fmtMoney(v: number | null | undefined, opts: { sign?: boolean; ccy?: string } = {}): string {
  if (!isNum(v)) return DASH;
  const s = Math.abs(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const sign = v < 0 ? '-' : opts.sign && v > 0 ? '+' : '';
  return `${sign}${opts.ccy ?? '$'}${s}`;
}

/** Percent where the input is already in percent units (e.g. 3.5 -> "3.50%"). */
export function fmtPct(v: number | null | undefined, opts: { sign?: boolean; dp?: number } = {}): string {
  if (!isNum(v)) return DASH;
  const dp = opts.dp ?? 2;
  const sign = opts.sign && v > 0 ? '+' : '';
  return `${sign}${v.toFixed(dp)}%`;
}

/** Percent where the input is a fraction (e.g. 0.035 -> "3.50%"). */
export function fmtFrac(v: number | null | undefined, opts: { sign?: boolean; dp?: number } = {}): string {
  if (!isNum(v)) return DASH;
  return fmtPct(v * 100, opts);
}

export function fmtR(v: number | null | undefined): string {
  if (!isNum(v)) return DASH;
  return `${v > 0 ? '+' : ''}${v.toFixed(3)}R`;
}

export function fmtCompact(v: number | null | undefined): string {
  if (!isNum(v)) return DASH;
  return Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 2 }).format(v);
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Compact local timestamp: "10-24 14:05:09" (same year) or "2025-10-24 14:05". */
export function fmtTs(ts: number | null | undefined, withSeconds = true): string {
  if (!isNum(ts) || ts <= 0) return DASH;
  const d = new Date(ts);
  const now = new Date();
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}${withSeconds ? `:${pad(d.getSeconds())}` : ''}`;
  const md = `${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  return d.getFullYear() === now.getFullYear() ? `${md} ${time}` : `${d.getFullYear()}-${md} ${time}`;
}

export function fmtDate(ts: number | null | undefined): string {
  if (!isNum(ts) || ts <= 0) return DASH;
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function fmtAxisTime(ts: number): string {
  const d = new Date(ts);
  return `${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fmtDuration(ms: number | null | undefined): string {
  if (!isNum(ms)) return DASH;
  const neg = ms < 0;
  let s = Math.floor(Math.abs(ms) / 1000);
  const d = Math.floor(s / 86400);
  s -= d * 86400;
  const h = Math.floor(s / 3600);
  s -= h * 3600;
  const m = Math.floor(s / 60);
  s -= m * 60;
  const out = d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m}m` : m > 0 ? `${m}m ${s}s` : `${s}s`;
  return neg ? `-${out}` : out;
}

export function fmtAge(ms: number | null | undefined): string {
  if (!isNum(ms)) return DASH;
  if (ms > 1e12) return 'never';
  return fmtDuration(ms);
}

/** CSS class for signed values. */
export function pnlClass(v: number | null | undefined): string {
  if (!isNum(v) || v === 0) return '';
  return v > 0 ? 'pos' : 'neg';
}

export function humanize(s: string): string {
  return s.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
}

/** "B-BTC_USDT" -> "BTC" (display only). */
export function shortSymbol(s: string): string {
  return s.replace(/^B-/, '').replace(/[_-]?USDT?$/, '') || s;
}

export function shortId(id: string | null | undefined, n = 8): string {
  if (!id) return DASH;
  return id.length > n ? id.slice(0, n) : id;
}

/** Engine sentinel for "never" (e.g. takeProfitPct = 1e9 on trend sleeves). */
export const NEVER_THRESHOLD = 1e8;
export function isNever(v: number | null | undefined): boolean {
  return !isNum(v) || Math.abs(v) >= NEVER_THRESHOLD;
}

/** Basis points (input already in bps). */
export function fmtBps(v: number | null | undefined, dp = 2): string {
  if (!isNum(v)) return DASH;
  return `${v.toFixed(dp)} bps`;
}

/** Signed score with 2 dp (e.g. "+0.55"). */
export function fmtScore(v: number | null | undefined, dp = 2): string {
  if (!isNum(v)) return DASH;
  return `${v > 0 ? '+' : ''}${v.toFixed(dp)}`;
}

/** Price with sensible precision: 2 dp above 1, more below. */
export function fmtPrice(v: number | null | undefined): string {
  if (!isNum(v)) return DASH;
  const a = Math.abs(v);
  return fmtNum(v, a >= 1000 ? 2 : a >= 1 ? 2 : a >= 0.01 ? 4 : 6);
}

/** Interpreted indicator value according to its backend-provided unit. */
export function fmtIndicator(v: number | null | undefined, unit: 'pct' | 'num' | 'ratio' | 'score' | undefined): string {
  if (!isNum(v)) return DASH;
  switch (unit) {
    case 'pct':
      return fmtFrac(v, { dp: 2 });
    case 'ratio':
      return fmtNum(v, 3);
    case 'score':
      return fmtScore(v, 2);
    default:
      return Math.abs(v) >= 100 ? fmtNum(v, 2) : Number.isInteger(v) ? fmtNum(v, 0) : fmtNum(v, Math.abs(v) >= 1 ? 2 : 3);
  }
}

/** Coerce an exchange numeric field (number or numeric string) to number. */
export function toNum(v: unknown): number | undefined {
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}
