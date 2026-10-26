/**
 * API payload types. These mirror the backend shapes (apps/backend/src/domain/types.ts,
 * persistence/ports.ts, engine/engine.ts, learning/*, api/server.ts). Rarely used or
 * server-stripped fields are optional.
 */

export type Mode = 'PAPER' | 'LIVE';
export type Timeframe = '1m' | '5m' | '15m' | '1h' | '4h' | '1d';
export const TIMEFRAMES: Timeframe[] = ['1m', '5m', '15m', '1h', '4h', '1d'];

export const REGIMES = [
  'STRONG_UPTREND',
  'STRONG_DOWNTREND',
  'RANGING',
  'HIGH_VOLATILITY',
  'LOW_VOLATILITY',
  'BREAKOUT',
  'BREAKDOWN',
  'REVERSAL_BULLISH',
  'REVERSAL_BEARISH',
  'CHOPPY',
] as const;
export type RegimeName = (typeof REGIMES)[number];

export const STRATEGIES = [
  'LONG_CALL',
  'LONG_PUT',
  'LONG_STRADDLE',
  'LONG_STRANGLE',
  'BULL_CALL_SPREAD',
  'BEAR_PUT_SPREAD',
  'BULL_PUT_SPREAD',
  'BEAR_CALL_SPREAD',
  'IRON_CONDOR',
  'LONG_CALL_BUTTERFLY',
  'FUTURES_LONG',
  'FUTURES_SHORT',
  'FUTURES_TSMOM',
  'FUTURES_CARRY',
  'FUTURES_XSMOM',
  'FUTURES_MR',
  'FUTURES_DONCHIAN',
] as const;
export type StrategyName = (typeof STRATEGIES)[number];

export type Direction = 'BULL' | 'BEAR' | 'NEUTRAL';
export type FeatureVector = Record<string, number>;

export interface LedgerMeta {
  seq: number;
  prevHash: string;
  hash: string;
  recordedAt: number;
}
export type Ledgered<T> = T & { _ledger?: LedgerMeta };

export interface Candle {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

// ------------------------------------------------------------------ regimes
export interface RegimeClassification {
  symbol: string;
  ts: number;
  primary: RegimeName;
  confidence: number;
  scores: Record<RegimeName, number>;
  probabilities: Record<RegimeName, number>;
  volState: 'HIGH' | 'NORMAL' | 'LOW';
  direction: Direction;
  evidence: Record<string, string[]>;
  modelVersion: string;
  sticky: boolean;
}

// ------------------------------------------------------------------ options
export type ChainSource = 'DERIBIT_REF' | 'COINDCX';

export interface OptionContract {
  symbol: string;
  underlying: string;
  strike: number;
  expiry: number;
  type: 'C' | 'P';
  bid: number;
  ask: number;
  mark: number;
  iv: number;
  openInterest?: number;
  volume24h?: number;
  contractSize: number;
  source: ChainSource;
}

export interface ChainMetrics {
  atmIv: number;
  riskReversal25d?: number;
  butterfly25d?: number;
  termSlope?: number;
  pcrOpenInterest?: number;
  pcrVolume?: number;
  maxPain?: number;
  totalOpenInterest?: number;
}

export interface OptionChainResponse {
  underlying: string;
  ts: number;
  spot: number;
  rate: number;
  contracts: OptionContract[];
  expiries: number[];
  source: ChainSource;
  metrics: ChainMetrics;
  selectedExpiry: number;
}

export type Signal = 'BULL' | 'BEAR' | 'NEUTRAL' | 'HIGH' | 'LOW';
/** How an interpreted indicator row is displayed. `pct` values are fractions (0.47 = 47.00%). */
export type IndicatorUnit = 'pct' | 'num' | 'ratio' | 'score';
export interface InterpretedRow {
  name: string;
  value: number;
  unit?: IndicatorUnit;
  signal: Signal;
  note: string;
}

export interface TopOfBook {
  bid: number;
  ask: number;
  ts?: number;
}

export interface LastPrice {
  price: number;
  ts: number;
}

export interface MarkInfo {
  mark: number;
  /** per 8h funding interval, as a fraction */
  fundingRate?: number;
  openInterest?: number;
  ts?: number;
}

export interface IndicatorsResponse {
  symbol: string;
  price: LastPrice | null;
  topOfBook: TopOfBook | null;
  mark: MarkInfo | null;
  chain: { source: ChainSource; ts: number; spot: number; metrics: ChainMetrics; expiries: number[]; contracts: number } | null;
  interpreted: InterpretedRow[];
  features: FeatureVector;
  regime: RegimeClassification | null;
}

// ------------------------------------------------------------------ strategies / evaluation
export type Side = 'BUY' | 'SELL';

export interface LegSpec {
  kind: 'OPTION' | 'FUTURE';
  instrument: string;
  side: Side;
  qty: number;
  ratio: number;
  option?: { strike: number; expiry: number; type: 'C' | 'P'; iv: number; contractSize: number };
  bid: number;
  ask: number;
  mark: number;
}

export interface Greeks {
  delta: number;
  gamma: number;
  vega: number;
  theta: number;
}

export interface Evaluation {
  netPremium: number;
  maxLoss: number;
  maxProfit: number | null;
  breakevens: number[];
  probabilityOfProfit: number;
  expectedValue: number;
  grossExpectedValue?: number;
  evPerRisk: number;
  rewardRisk: number | null;
  costs: { fees: number; slippage: number; spreadCost: number; funding: number; total: number };
  greeks: Greeks;
  liquidityScore: number;
  spreadPct: number;
  marginRequired: number;
  probTouchTarget?: number;
  terminalExpectedValue?: number;
  path?: {
    paths: number;
    stopHitPct: number;
    takeProfitPct: number;
    trailingPct: number;
    timeExitPct: number;
    p5: number;
    p95: number;
    mean?: number;
    meanStderr?: number;
    seed?: number;
  };
  horizonDays: number;
  ivUsed: number;
  forecastVol: number;
}

export interface StrategyCandidate {
  strategy: StrategyName;
  params: Record<string, number | string>;
  /** list endpoint replaces legs with their count */
  legs: LegSpec[] | number;
  evaluation: Evaluation | null;
  score: number;
  regimeAffinity: number;
  eligible: boolean;
  rejectedReasons: string[];
}

export interface RiskCheck {
  name: string;
  passed: boolean;
  value?: number | string;
  limit?: number | string;
  message: string;
}

export interface DataQuality {
  ok: boolean;
  reasons: string[];
  bookImbalanceAvail: number;
  ofiAvail: number;
  fundingAvail: number;
  oiAvail: number;
  ivAvail: number;
  cusumAvail: number;
  candleBars: number;
}

export interface MarketSnapshot {
  symbol: string;
  ts: number;
  spot: number;
  mark?: number;
  fundingRate?: number;
  openInterest?: number;
  bid?: number;
  ask?: number;
  features: FeatureVector;
  chainMetrics?: ChainMetrics;
  dataAgeMs: number;
  dataQuality?: DataQuality;
}

export type DecisionAction = 'OPEN' | 'NO_TRADE' | 'BLOCKED' | 'HOLDING';

export interface DecisionOutcome {
  decisionId: string;
  positionId: string;
  ts: number;
  realizedPnl: number;
  returnOnRisk: number;
  exitReason: string;
}

export interface DecisionRecord {
  id: string;
  ts: number;
  mode: Mode;
  symbol: string;
  modelVersion: string;
  snapshot: MarketSnapshot;
  regime: RegimeClassification;
  candidates: StrategyCandidate[];
  selected: StrategyName | null;
  rationale: string;
  riskChecks: RiskCheck[];
  action: DecisionAction;
  positionId?: string;
  orders: string[];
  _ledger?: LedgerMeta;
}

export interface DecisionDetail extends DecisionRecord {
  outcome: DecisionOutcome | null;
}

// ------------------------------------------------------------------ positions / trades
export interface ExitPlan {
  stopLossPct: number;
  takeProfitPct: number;
  trailingActivationPct: number;
  trailingDistancePct: number;
  timeExitAt: number;
  expiryBufferMs: number;
  /** > 1 means "never" */
  regimeInvalidationConfidence: number;
  /** signal-based exit, e.g. TSMOM: long exits below, short exits above */
  signalExit?: { feature: string; below?: number; above?: number };
  /** automatic profit protection (break-even + ratcheting lock + capture) */
  profitGuard?: ProfitGuardPlan;
  /** Exit Engine v2 (futures): R-based stop, profit milestones, Chandelier trailing */
  v2?: ExitV2Plan;
}

export interface ExitV2Plan {
  milestones: Array<{ r: number; fraction: number; lockR: number | null }>;
  chandelierAtrMult: number;
  atrFeature: string;
  trailActivateR: number;
  channelFeature?: string;
  finalTargetR: number;
  riskFraction: number;
}

export interface ExitBooking {
  ts: number;
  kind: 'PARTIAL' | 'CLOSE';
  reason: string;
  qty: number;
  price: number;
  grossPnl: number;
  fees: number;
  detail?: string;
}

export interface ProfitGuardPlan {
  breakevenAtPct: number;
  breakevenBufferPct: number;
  lockSteps: Array<[number, number]>;
  captureOfMaxProfitPct?: number;
}

export type PositionStatus = 'OPENING' | 'OPEN' | 'CLOSING' | 'CLOSED' | 'FAILED';

export interface PositionLeg extends LegSpec {
  entryPrice: number;
  filledQty: number;
  exitPrice?: number;
  exitQty?: number;
}

export interface Position {
  id: string;
  decisionId: string;
  mode: Mode;
  /** absent = CoinDCX (positions opened before multi-exchange support) */
  exchange?: ExchangeId;
  underlying: string;
  strategy: StrategyName;
  legs: PositionLeg[];
  units: number;
  openedAt: number;
  closedAt?: number;
  status: PositionStatus;
  entryCost: number;
  maxLoss: number;
  maxProfit: number | null;
  exitPlan: ExitPlan;
  peakPnl: number;
  troughPnl: number;
  realizedPnl?: number;
  fees: number;
  fundingPaid: number;
  exitReason?: string;
  modelVersion: string;
  regimeAtEntry: RegimeName;
  regimeConfidence: number;
  directionBias: Direction;
  params?: Record<string, number | string>;
  evAtEntry: number;
  popAtEntry: number;
  slippageCost: number;
  stopDistance?: number;
  leverage?: number;
  lastMarkPnl?: number;
  lastMarkAt?: number;
  /** Profit Guard locked floor, % of risk (null = not armed yet) */
  profitFloorPct?: number | null;
  /** Exit Engine v2: protective stop price (only ever tightens) */
  stopPrice?: number;
  stopKind?: 'INITIAL' | 'BREAKEVEN' | 'PROFIT_LOCK' | 'TRAIL';
  milestonesHit?: number[];
  bookings?: ExitBooking[];
}

export interface TradeRecord {
  positionId: string;
  decisionId: string;
  mode: Mode;
  source: 'LIVE' | 'PAPER' | 'BACKTEST';
  underlying: string;
  strategy: StrategyName;
  params?: Record<string, number | string>;
  modelVersion: string;
  regime: RegimeName;
  regimeConfidence: number;
  openedAt: number;
  closedAt: number;
  holdingMs: number;
  entryCost: number;
  maxLoss: number;
  realizedPnl: number;
  returnOnRisk: number;
  fees: number;
  funding: number;
  slippageCost: number;
  mae: number;
  mfe: number;
  exitReason: string;
  /** price P&L before fees and funding (net = realizedPnl) */
  grossPnl?: number;
  entryPrice?: number;
  exitPrice?: number;
  qty?: number;
  bookings?: ExitBooking[];
  expectedValueAtEntry: number;
  popAtEntry: number;
  _ledger?: LedgerMeta;
}

export interface EquitySnapshot {
  ts: number;
  mode: Mode;
  equity: number;
  cash: number;
  unrealizedPnl: number;
  realizedPnlToday: number;
  openPositions: number;
  drawdownPct: number;
}

// ------------------------------------------------------------------ status
export type KillKind = 'MANUAL' | 'DAILY_LOSS' | 'MAX_DRAWDOWN' | 'RECONCILIATION' | 'EXCHANGE_OUTAGE' | 'STALE_DATA' | 'INTERNAL_ERROR';

export interface KillSwitchState {
  engaged: boolean;
  kind?: KillKind;
  reason?: string;
  engagedAt?: number;
  engagedBy?: string;
  autoReleaseAt?: number;
  flatten: boolean;
}

export interface AccountStatus {
  equity: number;
  cash: number;
  unrealizedPnl: number;
  marginInUse: number;
  openPositions: number;
  realizedPnlToday: number;
  peakEquity: number;
  dayStartEquity: number;
  drawdownPct: number;
  dailyLossPct: number;
  consecutiveLosses: number;
  totalFees: number;
}

export interface VenueCapabilities {
  options: boolean;
  futures: boolean;
  reason?: string;
}

export interface ReconcileReport {
  ts: number;
  ok: boolean;
  exchange: Array<{ instrument: string; qty: number; avgPrice: number }>;
  local: Array<{ instrument: string; qty: number }>;
  mismatches: Array<{ instrument: string; exchangeQty: number; localQty: number; diff: number }>;
  unresolvedOrders: number;
  balance?: { equity: number; cash: number; marginInUse: number };
  error?: string;
}

export interface PendingLiveOrder {
  decisionId: string;
  symbol: string;
  strategy: StrategyName | null;
  expiresAt: number;
  rationale: string;
}

export type ExchangeId = 'coindcx' | 'delta';

export interface EngineStatus {
  instance: string;
  /** exchange this backend connected to at startup */
  exchange?: ExchangeId;
  mode: Mode;
  live: { armed: boolean; armedAt?: number; armedBy?: string; firstOrderConfirmed: boolean };
  pendingLiveOrder: PendingLiveOrder | null;
  paused: boolean;
  hasLease: boolean;
  killSwitch: KillSwitchState;
  symbols: string[];
  /** timeframes the engine tracks (candles exist only for these) */
  timeframes?: Timeframe[];
  decisionTimeframe?: Timeframe;
  capabilities: { paper: VenueCapabilities; live: VenueCapabilities };
  lastReconcile: ReconcileReport | null;
  /** null when no data has ever arrived (Infinity serialises to null) */
  dataAgeMs: Record<string, number | null>;
  models: { paper: string | null; live: string | null };
  accounts: Partial<Record<Mode, AccountStatus>>;
}

// ------------------------------------------------------------------ alerts / audit
export type AlertLevel = 'info' | 'warn' | 'error' | 'critical';
export interface AlertRecord {
  id: string;
  ts: number;
  level: AlertLevel;
  code: string;
  message: string;
  details?: Record<string, unknown>;
  acknowledged: boolean;
}

export interface AuditRecord {
  id: string;
  ts: number;
  actor: string;
  action: string;
  details: Record<string, unknown>;
  _ledger?: LedgerMeta;
}

export type AuditVerify = Record<string, { ok: boolean; brokenAt: number | null; checked: number }>;

// ------------------------------------------------------------------ performance
export interface PerfMetrics {
  trades: number;
  wins: number;
  losses: number;
  winRate: number;
  totalPnl: number;
  avgPnl: number;
  avgWin: number;
  avgLoss: number;
  expectancyR: number;
  profitFactor: number | null;
  payoffRatio: number | null;
  sharpePerTrade: number;
  maxDrawdown: number;
  maxDrawdownPct: number;
  totalFees: number;
  avgHoldHours: number;
  avgSlippage: number;
  evRealization: number | null;
}

export interface CurveMetrics {
  totalReturnPct: number;
  cagrPct: number;
  sharpe: number;
  sortino: number;
  calmar: number;
  maxDrawdownPct: number;
  volatilityPct: number;
  var95Pct: number;
  cvar95Pct: number;
  days: number;
}

export interface PerformanceResponse {
  mode: Mode;
  overall: PerfMetrics;
  curve: CurveMetrics;
  byRegime: Record<string, PerfMetrics>;
  byStrategy: Record<string, PerfMetrics>;
  byRegimeStrategy: Record<string, PerfMetrics>;
  byModel: Record<string, PerfMetrics>;
  byExitReason: Record<string, PerfMetrics>;
}

export interface StrategyParams {
  enabled: boolean;
  targetDte: number;
  longDelta: number;
  shortDelta: number;
  leverage: number;
}

export interface StrategyInfo {
  name: StrategyName;
  risk: 'DEFINED' | 'STOP_DEFINED';
  vega: '+' | '-' | '0';
  bias: string;
  description: string;
  params?: StrategyParams;
}

export interface StrategiesResponse {
  modelVersion?: string;
  strategies: StrategyInfo[];
  affinity?: Partial<Record<RegimeName, Partial<Record<StrategyName, number>>>>;
  regimes: RegimeName[];
  selection?: Record<string, unknown>;
  exits?: Record<string, unknown>;
  forecast?: Record<string, unknown>;
}

// ------------------------------------------------------------------ risk
export interface UtilEntry {
  value: number;
  limit: number;
}

export interface RiskResponse {
  mode: Mode;
  limits: Record<string, number | Record<string, number>>;
  killSwitch: KillSwitchState;
  utilisation: {
    dailyLossPct: UtilEntry;
    drawdownPct: UtilEntry;
    openPositions: UtilEntry;
    premiumAtRiskPct: UtilEntry;
    consecutiveLosses: UtilEntry;
  };
  openPositions: Array<{ id: string; strategy: StrategyName; underlying: string; maxLoss: number; lastMarkPnl?: number; exitPlan: ExitPlan }>;
}

// ------------------------------------------------------------------ models / learning
export type ModelStatus = 'CANDIDATE' | 'VALIDATED' | 'ACTIVE_PAPER' | 'APPROVED_LIVE' | 'RETIRED' | 'ROLLED_BACK' | 'REJECTED';

export interface Check {
  name: string;
  passed: boolean;
  detail: string;
}

export interface ModelVersionDoc {
  version: string;
  parentVersion: string | null;
  createdAt: number;
  status: ModelStatus;
  params?: unknown;
  validation?: Record<string, unknown>;
  livePerformance?: Record<string, unknown>;
  approvedBy?: string;
  approvedAt?: number;
  notes?: string;
  activeInPaper: boolean;
  activeInLive: boolean;
}

export type ExperimentKind = 'WALK_FORWARD' | 'PROMOTION' | 'ROLLBACK' | 'APPROVAL' | 'REJECTION' | 'BACKTEST' | 'BASELINE_COMPARISON';
export interface ExperimentRecord {
  id: string;
  ts: number;
  kind: ExperimentKind;
  modelVersion: string;
  baselineVersion?: string;
  summary: string;
  metrics: Record<string, unknown>;
  decision?: string;
}

export interface MonitorReport {
  mode: Mode;
  modelVersion: string | null;
  trades: number;
  expectancyR: number;
  maxDrawdownPct: number;
  validatedExpectancyR?: number;
  validatedMaxDrawdownPct?: number;
  action: 'NONE' | 'ROLLED_BACK' | 'INSUFFICIENT_DATA' | 'NO_BASELINE';
  reasons: string[];
  rolledBackTo?: string | null;
}

export interface LearningStatus {
  running: boolean;
  lastRunAt?: number;
  lastMonitor?: MonitorReport[];
  lastVerdict?: { promote: boolean; candidateVersion?: string; checks: Check[]; summary: unknown };
  progress: string[];
  error?: string;
}

// ------------------------------------------------------------------ backtests
export type Policy = { kind: 'REGIME_ENGINE' } | { kind: 'FIXED'; strategy: StrategyName } | { kind: 'RANDOM'; seed: number };

export interface BacktestResult {
  label: string;
  policy: Policy;
  modelVersion: string;
  equity?: Array<{ ts: number; equity: number }>;
  metrics: PerfMetrics;
  curve: CurveMetrics;
  byRegime?: Record<string, PerfMetrics>;
  byStrategy?: Record<string, PerfMetrics>;
  decisions: number;
  blocked: number;
  regimeCounts?: Record<string, number>;
  rejections?: Record<string, number>;
  from: number;
  to: number;
}

export interface BacktestJob {
  id: string;
  status: 'RUNNING' | 'DONE' | 'FAILED';
  createdAt: number;
  finishedAt?: number;
  request: Record<string, unknown>;
  progress: string[];
  error?: string;
  results?: BacktestResult[];
}

export interface BacktestRequest {
  from: number;
  to: number;
  symbols: string[];
  policy: 'REGIME_ENGINE' | 'FIXED' | 'RANDOM';
  strategy?: StrategyName;
  decisionEveryBars: number;
  compareBaselines: boolean;
}

// ------------------------------------------------------------------ live
export interface LiveReadiness {
  ready: boolean;
  checks: Array<{ name: string; passed: boolean; detail: string }>;
}

// ------------------------------------------------------------------ CoinDCX exchange views
export interface InstrumentSpec {
  pair: string;
  status?: string;
  kind?: string;
  settle_currency_short_name?: string;
  quote_currency_short_name?: string;
  underlying_currency_short_name?: string;
  price_increment?: number;
  quantity_increment?: number;
  min_quantity?: number;
  max_quantity?: number;
  min_notional?: number;
  max_leverage_long?: number;
  max_leverage_short?: number;
  /** percent per fill */
  maker_fee?: number;
  taker_fee?: number;
  max_market_order_quantity?: number;
  /** hours */
  funding_frequency?: number;
  order_types?: string[];
  time_in_force_options?: string[];
  [k: string]: unknown;
}

export interface ExchangeOverviewRow {
  symbol: string;
  underlying: string | null;
  price: number | null;
  priceTs: number | null;
  bid: number | null;
  ask: number | null;
  spreadBps: number | null;
  mark: number | null;
  /** per funding interval, fraction */
  fundingRate: number | null;
  /** already in percent */
  fundingAnnualPct: number | null;
  /** already in percent */
  change24hPct: number | null;
  volume24h: number | null;
  dataAgeMs: number | null;
  instrument: InstrumentSpec | null;
  instrumentError?: string;
}

export interface BookLevel {
  price: number;
  qty: number;
}
export interface OrderBook {
  instrument: string;
  ts: number;
  bids: BookLevel[];
  asks: BookLevel[];
}

export interface PublicTrade {
  price: number;
  quantity: number;
  timestamp: number;
  is_maker?: boolean;
  [k: string]: unknown;
}

export type Settled<T> = { ok: true; data: T } | { ok: false; error: string };

export interface ExchangeWallet {
  currency_short_name?: string;
  balance?: number | string;
  locked_balance?: number | string;
  cross_order_margin?: number | string;
  cross_user_margin?: number | string;
  [k: string]: unknown;
}

export interface ExchangePosition {
  id?: string;
  pair?: string;
  active_pos?: number;
  avg_price?: number;
  liquidation_price?: number;
  locked_margin?: number;
  leverage?: number;
  mark_price?: number;
  [k: string]: unknown;
}

export interface ExchangeOrder {
  id?: string;
  pair?: string;
  side?: string;
  status?: string;
  order_type?: string;
  price?: number;
  total_quantity?: number;
  remaining_quantity?: number;
  avg_price?: number;
  created_at?: number | string;
  [k: string]: unknown;
}

export interface ExchangeFill {
  price?: number;
  quantity?: number;
  is_maker?: boolean;
  fee_amount?: number;
  pair?: string;
  side?: string;
  timestamp?: number;
  order_id?: string;
  [k: string]: unknown;
}

export type ExchangeAccount =
  | { authenticated: false; message: string }
  | {
      authenticated: true;
      marginCurrency?: string;
      wallet: Settled<ExchangeWallet[] | ExchangeWallet>;
      positions: Settled<ExchangePosition[]>;
      openOrders: Settled<ExchangeOrder[]>;
      fills: Settled<ExchangeFill[]>;
    };

export interface EndpointCatalogueRow {
  name: string;
  method: string;
  path: string;
  auth: boolean;
  verified: string;
  usedFor: string;
}

export interface EndpointTelemetry {
  endpoint: string;
  auth: boolean;
  count: number;
  errors: number;
  lastStatus?: number;
  lastAt?: number;
  lastLatencyMs?: number;
  lastError?: string;
}

export interface ExchangeEndpoints {
  authenticated: boolean;
  exchange?: ExchangeId;
  baseUrls: { api?: string; public?: string; socket?: string };
  socket: { transport?: 'rest' | 'stream'; connected?: boolean; lastMessageAt?: number; [k: string]: unknown } | null;
  breaker: { name: string; state: string; failures: number } | null;
  catalogue: EndpointCatalogueRow[];
  telemetry: EndpointTelemetry[];
}
