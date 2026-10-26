/** Typed fetch helpers for the trading engine API. */
import { getOperatorName, getOperatorToken } from './operator';
import type {
  AlertRecord,
  AuditRecord,
  AuditVerify,
  BacktestJob,
  BacktestRequest,
  Candle,
  Check,
  DecisionDetail,
  DecisionRecord,
  EngineStatus,
  EquitySnapshot,
  ExchangeAccount,
  ExchangeEndpoints,
  ExchangeOverviewRow,
  OrderBook,
  PublicTrade,
  ExperimentRecord,
  IndicatorsResponse,
  KillSwitchState,
  LearningStatus,
  LiveReadiness,
  Mode,
  ModelVersionDoc,
  OptionChainResponse,
  PerformanceResponse,
  Position,
  RegimeClassification,
  RiskResponse,
  StrategiesResponse,
  Timeframe,
  TradeRecord,
} from './types';

export const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080').replace(/\/+$/, '');

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
  /** true when the backend could not be reached at all */
  get network(): boolean {
    return this.status === 0;
  }
}

type Query = Record<string, string | number | boolean | undefined | null>;

function url(path: string, q?: Query): string {
  const u = `${API_URL}${path}`;
  if (!q) return u;
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) if (v !== undefined && v !== null && v !== '') p.set(k, String(v));
  const s = p.toString();
  return s ? `${u}?${s}` : u;
}

async function handle<T>(res: Response): Promise<T> {
  const text = await res.text();
  let body: unknown = undefined;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }
  if (!res.ok) {
    const msg =
      body && typeof body === 'object' && 'error' in body && typeof (body as { error: unknown }).error === 'string'
        ? (body as { error: string }).error
        : body && typeof body === 'object' && 'message' in body && typeof (body as { message: unknown }).message === 'string'
          ? (body as { message: string }).message
          : `HTTP ${res.status}`;
    throw new ApiError(msg, res.status, body);
  }
  return body as T;
}

export async function apiGet<T>(path: string, q?: Query, signal?: AbortSignal): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url(path, q), { cache: 'no-store', headers: { Accept: 'application/json' }, signal });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    throw new ApiError(`Backend unreachable at ${API_URL}`, 0);
  }
  return handle<T>(res);
}

export async function apiPost<T>(path: string, body: unknown = {}): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', Accept: 'application/json' };
  const token = getOperatorToken().trim();
  const name = getOperatorName().trim();
  if (token) headers['X-Operator-Token'] = token;
  if (name) headers['X-Operator-Name'] = name;
  let res: Response;
  try {
    res = await fetch(url(path), { method: 'POST', cache: 'no-store', headers, body: JSON.stringify(body ?? {}) });
  } catch {
    throw new ApiError(`Backend unreachable at ${API_URL}`, 0);
  }
  return handle<T>(res);
}

export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  if (e instanceof Error) return e.message;
  return String(e);
}

const enc = encodeURIComponent;

/** Endpoint catalogue. */
export const api = {
  status: () => apiGet<EngineStatus>('/api/status'),
  regimes: () => apiGet<Record<string, RegimeClassification | null>>('/api/regimes'),
  regimeHistory: (symbol: string, limit = 300) => apiGet<RegimeClassification[]>(`/api/regimes/${enc(symbol)}/history`, { limit }),
  indicators: (symbol: string) => apiGet<IndicatorsResponse>(`/api/indicators/${enc(symbol)}`),
  candles: (symbol: string, tf?: Timeframe, limit = 300) => apiGet<Candle[]>(`/api/candles/${enc(symbol)}`, { tf, limit }),
  chain: (symbol: string, expiry?: number) => apiGet<OptionChainResponse>(`/api/chain/${enc(symbol)}`, { expiry }),

  decisions: (q: { symbol?: string; action?: string; limit?: number; before?: number } = {}) => apiGet<DecisionRecord[]>('/api/decisions', q),
  decision: (id: string) => apiGet<DecisionDetail>(`/api/decisions/${enc(id)}`),
  positions: (q: { mode?: Mode; status?: 'open'; limit?: number } = {}) => apiGet<Position[]>('/api/positions', q),
  trades: (q: { mode?: Mode; strategy?: string; regime?: string; limit?: number } = {}) => apiGet<TradeRecord[]>('/api/trades', q),
  performance: (mode: Mode, modelVersion?: string) => apiGet<PerformanceResponse>('/api/performance', { mode, modelVersion }),
  equity: (mode: Mode, days = 30) => apiGet<EquitySnapshot[]>('/api/equity', { mode, days }),
  risk: () => apiGet<RiskResponse>('/api/risk'),
  strategies: () => apiGet<StrategiesResponse>('/api/strategies'),

  models: () => apiGet<ModelVersionDoc[]>('/api/models'),
  experiments: (limit = 100) => apiGet<ExperimentRecord[]>('/api/experiments', { limit }),
  learningStatus: () => apiGet<LearningStatus>('/api/learning/status'),
  runLearning: () => apiPost<{ started: boolean }>('/api/learning/run'),
  approveLive: (version: string, confirm: string) => apiPost<{ approved: boolean; checks: Check[] }>(`/api/models/${enc(version)}/approve-live`, { confirm }),
  activatePaper: (version: string) => apiPost<{ ok: boolean }>(`/api/models/${enc(version)}/activate-paper`),
  rollback: (mode: Mode, reason?: string) => apiPost<{ ok: boolean; rolledBackTo: string | null }>('/api/models/rollback', { mode, reason }),

  startBacktest: (req: BacktestRequest) => apiPost<{ id: string; status: BacktestJob['status'] }>('/api/backtests', req),
  backtests: () => apiGet<BacktestJob[]>('/api/backtests'),
  backtest: (id: string) => apiGet<BacktestJob>(`/api/backtests/${enc(id)}`),

  alerts: (limit = 50) => apiGet<AlertRecord[]>('/api/alerts', { limit }),
  ackAlert: (id: string) => apiPost<{ ok: boolean }>(`/api/alerts/${enc(id)}/ack`),
  audit: (limit = 200) => apiGet<AuditRecord[]>('/api/audit', { limit }),
  auditVerify: () => apiGet<AuditVerify>('/api/audit/verify'),

  killSwitch: (body: { action: 'engage' | 'release'; reason?: string; flatten?: boolean }) =>
    apiPost<{ ok: boolean; killSwitch: KillSwitchState }>('/api/kill-switch', body),
  liveReadiness: () => apiGet<LiveReadiness>('/api/live/readiness'),
  armLive: (confirmPhrase: string) => apiPost<{ ok: boolean; message: string; checks: unknown; requiredPhrase: string }>('/api/live/arm', { confirmPhrase }),
  disarmLive: (reason?: string) => apiPost<{ ok: boolean }>('/api/live/disarm', { reason }),
  confirmFirstOrder: (decisionId: string) => apiPost<{ ok: boolean; message: string }>('/api/live/confirm-first-order', { decisionId }),
  exchangeOverview: () => apiGet<ExchangeOverviewRow[]>('/api/exchange/overview'),
  exchangeOrderbook: (symbol: string, depth: 10 | 20 | 50 = 20) => apiGet<OrderBook>(`/api/exchange/orderbook/${enc(symbol)}`, { depth }),
  exchangeTrades: (symbol: string) => apiGet<PublicTrade[]>(`/api/exchange/trades/${enc(symbol)}`),
  exchangeAccount: () => apiGet<ExchangeAccount>('/api/exchange/account'),
  exchangeEndpoints: () => apiGet<ExchangeEndpoints>('/api/exchange/endpoints'),
  closePosition: (id: string) => apiPost<Position | null>(`/api/positions/${enc(id)}/close`),
};

export const LIVE_CONFIRM_PHRASE = 'ENABLE LIVE TRADING';
