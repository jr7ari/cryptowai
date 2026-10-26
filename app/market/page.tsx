'use client';

import { ExName, useExchangeLabel } from '@/components/ExchangeName';
import { useEffect, useMemo, useState } from 'react';
import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api } from '@/lib/api';
import { fmtAge, fmtAxisTime, fmtBps, fmtCompact, fmtFrac, fmtMoney, fmtNum, fmtPct, fmtPrice, fmtTs, humanize, pnlClass, toNum } from '@/lib/format';
import { useNow, usePoll } from '@/lib/hooks';
import {
  TIMEFRAMES,
  type ExchangeAccount,
  type ExchangeOrder,
  type ExchangeOverviewRow,
  type ExchangePosition,
  type ExchangeFill,
  type ExchangeWallet,
  type InstrumentSpec,
  type OrderBook,
  type PublicTrade,
  type Settled,
  type Timeframe,
} from '@/lib/types';
import { AXIS, ChartBox, GRID, TOOLTIP_STYLE } from '@/components/charts';
import { useEngine } from '@/components/providers';
import { Table } from '@/components/Table';
import { Badge, Card, DataState, EmptyState, ErrorBanner, KV, Kpi, PageHeader, Segmented } from '@/components/ui';

const DASH = '—';

// ------------------------------------------------------------------ symbol cards
function specRows(i: InstrumentSpec, quote: string): Array<[string, React.ReactNode]> {
  const n = (v: unknown, dp?: number) => {
    const x = toNum(v);
    return x === undefined ? DASH : dp === undefined ? String(x) : fmtNum(x, dp);
  };
  return [
    ['Status', i.status ? <Badge key="s" tone={i.status === 'active' ? 'green' : 'amber'}>{i.status.toUpperCase()}</Badge> : DASH],
    ['Kind', i.kind ?? DASH],
    ['Price increment', `${n(i.price_increment)} ${quote}`],
    ['Quantity increment', `${n(i.quantity_increment)} ${i.underlying_currency_short_name ?? ''}`.trim()],
    ['Min quantity', `${n(i.min_quantity)} ${i.underlying_currency_short_name ?? ''}`.trim()],
    ['Max quantity', `${n(i.max_quantity)} ${i.underlying_currency_short_name ?? ''}`.trim()],
    ['Max market order qty', n(i.max_market_order_quantity)],
    ['Min notional', toNum(i.min_notional) !== undefined ? `${n(i.min_notional, 2)} ${quote}` : DASH],
    ['Max leverage long / short', `${n(i.max_leverage_long)}× / ${n(i.max_leverage_short)}×`],
    ['Maker / taker fee', `${fmtPct(toNum(i.maker_fee), { dp: 3 })} / ${fmtPct(toNum(i.taker_fee), { dp: 3 })}`],
    ['Funding frequency', toNum(i.funding_frequency) !== undefined ? `every ${n(i.funding_frequency)} h` : DASH],
    ['Order types', i.order_types?.length ? i.order_types.map((o) => humanize(o)).join(', ') : DASH],
    ['Time in force', i.time_in_force_options?.length ? i.time_in_force_options.map((o) => humanize(o)).join(', ') : DASH],
  ];
}

function SymbolCard({ r, selected, onSelect }: { r: ExchangeOverviewRow; selected: boolean; onSelect: () => void }) {
  const quote = r.instrument?.quote_currency_short_name ?? 'USDT';
  const fr = r.fundingRate;
  const freqH = toNum(r.instrument?.funding_frequency) ?? 8;
  const stale = r.dataAgeMs === null || r.dataAgeMs > 20_000;
  return (
    <Card
      title={
        <span className="row" style={{ gap: 8 }}>
          <span className="mono">{r.symbol}</span>
          {r.underlying && <span className="muted small">{r.underlying} perpetual</span>}
        </span>
      }
      className={selected ? 'card-selected' : ''}
      actions={
        <>
          <Badge tone={stale ? 'amber' : 'green'} title="Age of the latest market data from the exchange">
            {r.dataAgeMs === null ? 'NO DATA' : `data ${fmtAge(r.dataAgeMs)}`}
          </Badge>
          <button type="button" className={`btn btn-sm ${selected ? 'btn-primary' : ''}`} onClick={onSelect} aria-pressed={selected}>
            {selected ? 'Selected' : 'Show book'}
          </button>
        </>
      }
    >
      <div className="kpis">
        <Kpi label="Last price" value={fmtPrice(r.price)} hint={r.priceTs ? fmtTs(r.priceTs) : undefined} />
        <Kpi label="24h change" value={fmtPct(r.change24hPct, { sign: true })} tone={pnlClass(r.change24hPct) as 'pos' | 'neg' | ''} hint={r.volume24h !== null ? `vol ${fmtCompact(r.volume24h)}` : undefined} />
        <Kpi label="Bid" value={<span className="pos">{fmtPrice(r.bid)}</span>} />
        <Kpi label="Ask" value={<span className="neg">{fmtPrice(r.ask)}</span>} />
        <Kpi label="Spread" value={fmtBps(r.spreadBps)} hint={r.bid !== null && r.ask !== null ? `${fmtPrice(r.ask - r.bid)} ${quote}` : undefined} />
        <Kpi label="Mark" value={fmtPrice(r.mark)} hint={r.mark !== null && r.price !== null ? `basis ${fmtBps(((r.mark - r.price) / r.price) * 10_000)}` : undefined} />
        <Kpi label={`Funding (${freqH}h)`} value={fmtFrac(fr, { dp: 4, sign: true })} tone={fr === null ? '' : fr > 0 ? 'warn' : 'info'} hint={fr === null ? 'not available' : fr > 0 ? 'longs pay shorts' : 'shorts pay longs'} />
        <Kpi label="Funding annualised" value={fmtPct(r.fundingAnnualPct, { sign: true })} tone={r.fundingAnnualPct === null ? '' : r.fundingAnnualPct > 0 ? 'warn' : 'info'} hint="3 × per day × 365" />
      </div>
      <h3>Instrument spec (<ExName />)</h3>
      {r.instrumentError && (
        <div className="banner banner-error compact" role="alert">
          Instrument details failed: {r.instrumentError}
        </div>
      )}
      {r.instrument ? <KV items={specRows(r.instrument, quote)} /> : !r.instrumentError && <EmptyState title="No instrument details" />}
    </Card>
  );
}

// ------------------------------------------------------------------ order book
function BookSide({ levels, side, maxCum }: { levels: Array<{ price: number; qty: number; cum: number }>; side: 'bid' | 'ask'; maxCum: number }) {
  return (
    <div className={`book-side book-${side}`} role="table" aria-label={side === 'bid' ? 'Bids' : 'Asks'}>
      <div className="book-row book-head" role="row">
        <span role="columnheader">{side === 'bid' ? 'Bid' : 'Ask'}</span>
        <span role="columnheader" className="ta-right">
          Size
        </span>
        <span role="columnheader" className="ta-right book-cum">
          Total
        </span>
      </div>
      {levels.map((l) => (
        <div key={l.price} className="book-row" role="row">
          <span className="book-bar" style={{ width: `${maxCum > 0 ? (l.cum / maxCum) * 100 : 0}%` }} aria-hidden />
          <span role="cell" className="mono book-txt">
            {fmtPrice(l.price)}
          </span>
          <span role="cell" className="mono ta-right">
            {fmtNum(l.qty, 3)}
          </span>
          <span role="cell" className="mono ta-right muted book-cum">
            {fmtNum(l.cum, 3)}
          </span>
        </div>
      ))}
    </div>
  );
}

function OrderBookView({ ob }: { ob: OrderBook }) {
  const now = useNow(1000);
  const bids = useMemo(() => {
    let c = 0;
    return [...ob.bids].sort((a, b) => b.price - a.price).map((l) => ({ ...l, cum: (c += l.qty) }));
  }, [ob]);
  const asks = useMemo(() => {
    let c = 0;
    return [...ob.asks].sort((a, b) => a.price - b.price).map((l) => ({ ...l, cum: (c += l.qty) }));
  }, [ob]);
  const maxCum = Math.max(bids[bids.length - 1]?.cum ?? 0, asks[asks.length - 1]?.cum ?? 0);
  const bb = bids[0]?.price;
  const ba = asks[0]?.price;
  const mid = bb !== undefined && ba !== undefined ? (bb + ba) / 2 : undefined;
  const spread = mid !== undefined ? ba! - bb! : undefined;
  const bidQty = bids[bids.length - 1]?.cum ?? 0;
  const askQty = asks[asks.length - 1]?.cum ?? 0;
  const imb = bidQty + askQty > 0 ? (bidQty - askQty) / (bidQty + askQty) : undefined;
  if (!bids.length && !asks.length) return <EmptyState title="Order book is empty" />;
  return (
    <>
      <div className="book-mid">
        <span>
          <span className="muted small">Mid</span> <strong className="mono">{fmtPrice(mid)}</strong>
        </span>
        <span>
          <span className="muted small">Spread</span> <span className="mono">{fmtPrice(spread)}</span>{' '}
          <span className="muted small mono">({fmtBps(mid ? (spread! / mid) * 10_000 : undefined)})</span>
        </span>
        <span title="(bid size − ask size) ÷ total size across the shown levels">
          <span className="muted small">Imbalance</span> <span className={`mono ${pnlClass(imb)}`}>{imb === undefined ? DASH : fmtFrac(imb, { sign: true, dp: 1 })}</span>
        </span>
        <span className="muted small">updated {fmtAge(now - ob.ts)} ago</span>
      </div>
      <div className="book">
        <BookSide levels={bids} side="bid" maxCum={maxCum} />
        <BookSide levels={asks} side="ask" maxCum={maxCum} />
      </div>
    </>
  );
}

// ------------------------------------------------------------------ trades
function TradesView({ trades }: { trades: PublicTrade[] }) {
  const rows = useMemo(() => {
    const sorted = [...trades].sort((a, b) => b.timestamp - a.timestamp);
    // tick rule: up-tick = buyer-initiated, down-tick = seller-initiated
    return sorted.map((t, i) => {
      const prev = sorted[i + 1];
      const dir = prev ? Math.sign(t.price - prev.price) : 0;
      return { ...t, dir, key: `${t.timestamp}-${i}` };
    });
  }, [trades]);
  return (
    <Table
      dense
      maxHeight={430}
      rows={rows}
      rowKey={(r) => r.key}
      emptyTitle="No public trades"
      columns={[
        { key: 'timestamp', header: 'Time', render: (t) => <span className="mono small">{fmtTs(t.timestamp)}</span> },
        { key: 'price', header: 'Price', align: 'right', render: (t) => <span className={`mono ${t.dir > 0 ? 'pos' : t.dir < 0 ? 'neg' : ''}`}>{fmtPrice(t.price)}</span> },
        { key: 'quantity', header: 'Qty', align: 'right', render: (t) => <span className="mono">{fmtNum(t.quantity, 3)}</span> },
        { key: 'notional', header: 'Notional', align: 'right', sort: (t) => t.price * t.quantity, render: (t) => <span className="mono">{fmtMoney(t.price * t.quantity)}</span> },
        { key: 'is_maker', header: 'Maker', render: (t) => (t.is_maker === undefined ? DASH : t.is_maker ? <Badge tone="grey">maker</Badge> : <Badge tone="blue">taker</Badge>) },
      ]}
    />
  );
}

// ------------------------------------------------------------------ chart
function PriceChart({ symbol }: { symbol: string }) {
  const { status: st } = useEngine();
  const tfs = st?.timeframes?.length ? st.timeframes : TIMEFRAMES;
  const [tf, setTf] = useState<Timeframe>('1h');
  const c = usePoll(`mkt-candles:${symbol}:${tf}`, () => api.candles(symbol, tfs.includes(tf) ? tf : tfs[0], 300), 30_000);
  const last = c.data?.[c.data.length - 1];
  const first = c.data?.[0];
  const chg = last && first && first.c > 0 ? ((last.c - first.c) / first.c) * 100 : undefined;
  return (
    <Card
      title={`${symbol} price`}
      subtitle={
        last ? (
          <>
            close {fmtPrice(last.c)} · {c.data!.length} closed {tf} candles · range change <span className={pnlClass(chg)}>{fmtPct(chg, { sign: true })}</span>
          </>
        ) : (
          <><ExName /> futures candlesticks (closed bars)</>
        )
      }
      actions={<Segmented label="Timeframe" value={tfs.includes(tf) ? tf : tfs[0]} options={tfs} onChange={setTf} />}
    >
      <DataState
        data={c.data}
        error={c.error}
        loading={c.loading}
        reload={c.reload}
        empty={(d) => d.length < 2}
        emptyTitle={`No ${tf} candles: the engine only keeps the timeframes it is configured to track`}
      >
        {(d) => (
          <ChartBox height={280} label={`${symbol} ${tf} close and volume`}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={d} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid {...GRID} vertical={false} />
                <XAxis dataKey="t" type="number" scale="time" domain={['dataMin', 'dataMax']} tickFormatter={fmtAxisTime} minTickGap={50} {...AXIS} />
                <YAxis yAxisId="p" domain={['auto', 'auto']} width={68} tickFormatter={(v: number) => fmtNum(v, v > 100 ? 0 : 2)} {...AXIS} />
                <YAxis yAxisId="v" orientation="right" hide domain={[0, (max: number) => max * 4]} />
                <Tooltip
                  {...TOOLTIP_STYLE}
                  labelFormatter={(v) => fmtTs(Number(v))}
                  formatter={(v, n) => (n === 'v' ? [fmtCompact(Number(v)), 'Volume'] : [fmtPrice(Number(v)), 'Close'])}
                />
                <Bar yAxisId="v" dataKey="v" fill="#334155" isAnimationActive={false} />
                <Line yAxisId="p" type="monotone" dataKey="c" stroke="#60a5fa" strokeWidth={1.6} dot={false} isAnimationActive={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </ChartBox>
        )}
      </DataState>
    </Card>
  );
}

// ------------------------------------------------------------------ account
function SectionState<T>({ s, children }: { s: Settled<T>; children: (d: T) => React.ReactNode }) {
  if (!s.ok)
    return (
      <div className="banner banner-error compact" role="alert">
        <div>
          <strong><ExName /> request failed.</strong> {s.error}
        </div>
      </div>
    );
  return <>{children(s.data)}</>;
}

function SectionBadge({ s }: { s: Settled<unknown> }) {
  return s.ok ? <Badge tone="green">OK</Badge> : <Badge tone="red">ERROR</Badge>;
}

function WalletView({ w, ccy }: { w: ExchangeWallet[] | ExchangeWallet; ccy?: string }) {
  const list = Array.isArray(w) ? w : [w];
  if (!list.length) return <EmptyState title="No wallet entries" />;
  const sorted = [...list].sort((a, b) => (a.currency_short_name === ccy ? -1 : b.currency_short_name === ccy ? 1 : 0));
  return (
    <div className="stack">
      {sorted.map((e, i) => {
        const bal = toNum(e.balance);
        const locked = toNum(e.locked_balance);
        const avail = bal !== undefined ? bal - (locked ?? 0) : undefined;
        const c = e.currency_short_name ?? '';
        return (
          <div key={`${c}-${i}`}>
            <div className="row" style={{ marginBottom: 6 }}>
              <strong className="mono">{c || 'wallet'}</strong>
              {c === ccy && <Badge tone="blue">margin currency</Badge>}
            </div>
            <div className="kpis">
              <Kpi label="Balance" value={fmtMoney(bal, { ccy: '' })} hint={c} />
              <Kpi label="Locked" value={fmtMoney(locked, { ccy: '' })} hint={c} />
              <Kpi label="Available" value={fmtMoney(avail, { ccy: '' })} hint="balance − locked" />
              {toNum(e.cross_order_margin) !== undefined && <Kpi label="Cross order margin" value={fmtMoney(toNum(e.cross_order_margin), { ccy: '' })} />}
              {toNum(e.cross_user_margin) !== undefined && <Kpi label="Cross user margin" value={fmtMoney(toNum(e.cross_user_margin), { ccy: '' })} />}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function AccountView({ a }: { a: ExchangeAccount }) {
  if (!a.authenticated)
    return (
      <Card title={<><ExName /> futures account</>} actions={<Badge tone="grey">NOT AUTHENTICATED</Badge>}>
        <div className="banner banner-warn">
          <div>
            <strong>{a.message}</strong>
          </div>
        </div>
        <p style={{ marginTop: 10 }}>To view the live exchange account, set these environment variables on the backend and restart it:</p>
        <pre className="log">{`COINDCX_API_KEY=<your key>\nCOINDCX_API_SECRET=<your secret>`}</pre>
        <p className="muted small" style={{ marginTop: 8 }}>
          Use a futures-enabled key with IP whitelisting and no withdrawal permission. Keys stay on the backend; this dashboard only reads the account.
        </p>
      </Card>
    );
  const ccy = a.marginCurrency;
  return (
    <>
      <Card title={<><ExName /> futures wallet</>} subtitle={`Margin currency ${ccy ?? DASH}`} actions={<SectionBadge s={a.wallet} />}>
        <SectionState s={a.wallet}>{(w) => <WalletView w={w} ccy={ccy} />}</SectionState>
      </Card>
      <Card title="Exchange positions" subtitle={<>As reported by <ExName /> (source of truth for reconciliation)</>} actions={<SectionBadge s={a.positions} />}>
        <SectionState s={a.positions}>
          {(rows) => (
            <Table<ExchangePosition>
              dense
              rows={rows.filter((p) => toNum(p.active_pos) !== 0 || rows.length < 10)}
              rowKey={(p, i) => String(p.id ?? `${p.pair}-${i}`)}
              emptyTitle="No exchange positions"
              columns={[
                { key: 'pair', header: 'Pair', render: (p) => <span className="mono">{p.pair ?? DASH}</span> },
                {
                  key: 'active_pos',
                  header: 'Active pos',
                  align: 'right',
                  render: (p) => {
                    const q = toNum(p.active_pos);
                    return <span className={`mono ${pnlClass(q)}`}>{q === undefined ? DASH : `${q > 0 ? '+' : ''}${fmtNum(q, 4)}`}</span>;
                  },
                },
                { key: 'avg_price', header: 'Avg price', align: 'right', render: (p) => <span className="mono">{fmtPrice(toNum(p.avg_price))}</span> },
                { key: 'liquidation_price', header: 'Liq. price', align: 'right', render: (p) => <span className="mono warn">{fmtPrice(toNum(p.liquidation_price))}</span> },
                { key: 'locked_margin', header: 'Locked margin', align: 'right', render: (p) => <span className="mono">{fmtMoney(toNum(p.locked_margin), { ccy: '' })}</span> },
                { key: 'leverage', header: 'Lev', align: 'right', render: (p) => (toNum(p.leverage) !== undefined ? `${fmtNum(toNum(p.leverage), 1)}×` : DASH) },
              ]}
            />
          )}
        </SectionState>
      </Card>
      <div className="grid grid-2">
        <Card title="Open orders" actions={<SectionBadge s={a.openOrders} />}>
          <SectionState s={a.openOrders}>
            {(rows) => (
              <Table<ExchangeOrder>
                dense
                rows={rows}
                rowKey={(o, i) => String(o.id ?? i)}
                emptyTitle="No open orders"
                columns={[
                  { key: 'pair', header: 'Pair', render: (o) => <span className="mono">{o.pair ?? DASH}</span> },
                  { key: 'side', header: 'Side', render: (o) => (o.side ? <Badge tone={o.side === 'buy' ? 'green' : 'red'}>{o.side.toUpperCase()}</Badge> : DASH) },
                  { key: 'order_type', header: 'Type', render: (o) => (o.order_type ? humanize(o.order_type) : DASH) },
                  { key: 'price', header: 'Price', align: 'right', render: (o) => <span className="mono">{fmtPrice(toNum(o.price))}</span> },
                  { key: 'total_quantity', header: 'Qty', align: 'right', render: (o) => <span className="mono">{fmtNum(toNum(o.total_quantity), 4)}</span> },
                  { key: 'remaining_quantity', header: 'Remaining', align: 'right', render: (o) => <span className="mono">{fmtNum(toNum(o.remaining_quantity), 4)}</span> },
                  { key: 'status', header: 'Status', render: (o) => o.status ?? DASH },
                ]}
              />
            )}
          </SectionState>
        </Card>
        <Card title="Recent fills" actions={<SectionBadge s={a.fills} />}>
          <SectionState s={a.fills}>
            {(rows) => (
              <Table<ExchangeFill>
                dense
                maxHeight={360}
                rows={rows}
                rowKey={(f, i) => `${f.order_id ?? ''}-${f.timestamp ?? ''}-${i}`}
                emptyTitle="No fills"
                initialSort={{ key: 'timestamp', dir: 'desc' }}
                columns={[
                  { key: 'timestamp', header: 'Time', render: (f) => <span className="mono small">{fmtTs(toNum(f.timestamp))}</span> },
                  { key: 'pair', header: 'Pair', render: (f) => <span className="mono">{f.pair ?? DASH}</span> },
                  { key: 'side', header: 'Side', render: (f) => (f.side ? <Badge tone={f.side === 'buy' ? 'green' : 'red'}>{f.side.toUpperCase()}</Badge> : DASH) },
                  { key: 'price', header: 'Price', align: 'right', render: (f) => <span className="mono">{fmtPrice(toNum(f.price))}</span> },
                  { key: 'quantity', header: 'Qty', align: 'right', render: (f) => <span className="mono">{fmtNum(toNum(f.quantity), 4)}</span> },
                  { key: 'fee_amount', header: 'Fee', align: 'right', render: (f) => <span className="mono">{fmtMoney(toNum(f.fee_amount), { ccy: '' })}</span> },
                  { key: 'is_maker', header: 'Liquidity', render: (f) => (f.is_maker === undefined ? DASH : f.is_maker ? 'maker' : 'taker') },
                ]}
              />
            )}
          </SectionState>
        </Card>
      </div>
    </>
  );
}

// ------------------------------------------------------------------ page
const DEPTHS = ['10', '20', '50'] as const;

export default function MarketPage() {
  const { status } = useEngine();
  const exLabel = useExchangeLabel();
  const overview = usePoll('exchange:overview', api.exchangeOverview, 5_000);
  const symbols = useMemo(() => overview.data?.map((r) => r.symbol) ?? status?.symbols ?? [], [overview.data, status?.symbols]);
  const [sel, setSel] = useState('');
  const [depth, setDepth] = useState<(typeof DEPTHS)[number]>('20');
  useEffect(() => {
    if ((!sel || !symbols.includes(sel)) && symbols.length) setSel(symbols[0]);
  }, [sel, symbols]);
  const book = usePoll(sel ? `exchange:book:${sel}:${depth}` : null, () => api.exchangeOrderbook(sel, Number(depth) as 10 | 20 | 50), 3_000);
  const trades = usePoll(sel ? `exchange:trades:${sel}` : null, () => api.exchangeTrades(sel), 5_000);
  const account = usePoll('exchange:account', api.exchangeAccount, 15_000);

  return (
    <>
      <PageHeader title={`${exLabel} Market`}>{symbols.length > 0 && <Segmented label="Symbol" value={sel} options={symbols} onChange={setSel} />}</PageHeader>
      <p className="muted small" style={{ margin: '-8px 0 0' }}>
        Live {exLabel} perpetual futures data as seen by the engine (refreshes every 3–15 s). Options are not tradable LIVE through this engine; see Exchange API.
      </p>

      <DataState data={overview.data} error={overview.error} loading={overview.loading} reload={overview.reload} empty={(d) => !d.length} emptyTitle="No symbols configured">
        {(rows) => (
          <div className="grid grid-2">
            {rows.map((r) => (
              <SymbolCard key={r.symbol} r={r} selected={r.symbol === sel} onSelect={() => setSel(r.symbol)} />
            ))}
          </div>
        )}
      </DataState>

      {sel && (
        <div className="grid grid-2">
          <Card
            title={`Order book · ${sel}`}
            subtitle="Bids (green) and asks (red); bar = cumulative size · refreshes every 3 s"
            actions={<Segmented label="Depth" value={depth} options={DEPTHS} onChange={setDepth} />}
          >
            <DataState data={book.data} error={book.error} loading={book.loading} reload={book.reload}>
              {(ob) => <OrderBookView ob={ob} />}
            </DataState>
          </Card>
          <Card title={`Recent trades · ${sel}`} subtitle="Public tape; price colour = up-tick / down-tick vs previous trade">
            <DataState data={trades.data} error={trades.error} loading={trades.loading} reload={trades.reload}>
              {(t) => <TradesView trades={t} />}
            </DataState>
          </Card>
        </div>
      )}

      {sel && <PriceChart symbol={sel} />}

      <h2 className="section-title">{exLabel} futures account</h2>
      {account.error && <ErrorBanner error={account.error} onRetry={account.reload} />}
      {account.data ? <AccountView a={account.data} /> : !account.error && <Card title={`${exLabel} futures account`}>{account.loading ? <p className="muted">Loading…</p> : <EmptyState title="No account data" />}</Card>}
    </>
  );
}
