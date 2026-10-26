'use client';

import { ExName } from '@/components/ExchangeName';
import { useMemo } from 'react';
import { api } from '@/lib/api';
import { fmtAge, fmtFrac, fmtNum, fmtTs } from '@/lib/format';
import { useNow, usePoll } from '@/lib/hooks';
import type { EndpointCatalogueRow, EndpointTelemetry, ExchangeEndpoints } from '@/lib/types';
import { Table } from '@/components/Table';
import { Badge, Card, DataState, KV, Kpi, PageHeader } from '@/components/ui';

const DASH = '—';

/** Path part of a catalogue entry ("public: /x/{pair}/y?pcode=f" -> "/x/{pair}/y"). */
function cataloguePath(p: string): string {
  return p.replace(/^[a-z]+:\s*/i, '').replace(/\?.*$/, '').trim();
}

/** Telemetry key "GET host:port/path" -> { method, path }. */
function telemetryParts(endpoint: string): { method: string; path: string } {
  const m = /^(\S+)\s+(\S+)$/.exec(endpoint.trim());
  if (!m) return { method: '', path: endpoint };
  const rest = m[2].replace(/^[a-z]+:\/\//i, '');
  const i = rest.indexOf('/');
  return { method: m[1].toUpperCase(), path: i >= 0 ? rest.slice(i) : rest };
}

/** Build a matcher for a catalogue path: {placeholders} match any segment text; anchored so /orders does not match /orders/create. */
function pathMatcher(p: string): RegExp | null {
  const path = cataloguePath(p);
  if (!path.startsWith('/')) return null;
  const esc = path
    .split(/(\{[^}]+\})/)
    .map((part) => (part.startsWith('{') ? '[^/]+' : part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
    .join('');
  return new RegExp(`^${esc}/?$`);
}

interface Joined extends EndpointCatalogueRow {
  key: string;
  unavailable: boolean;
  tel: EndpointTelemetry[];
  calls: number;
  errors: number;
  lastStatus?: number;
  lastLatencyMs?: number;
  lastAt?: number;
  lastError?: string;
}

function join(d: ExchangeEndpoints): { rows: Joined[]; orphans: EndpointTelemetry[] } {
  const used = new Set<string>();
  const rows = d.catalogue.map((c, i) => {
    const re = pathMatcher(c.path);
    const method = c.method.split(/\s/)[0].toUpperCase();
    const tel = re
      ? d.telemetry.filter((t) => {
          const tp = telemetryParts(t.endpoint);
          // methods like "GET (signed body)" fall back between GET/POST, so only require the path to match
          return re.test(tp.path) || (tp.path.includes(cataloguePath(c.path)) && (method === '-' || method === 'WS' || tp.method === method || c.method.includes('signed')));
        })
      : [];
    tel.forEach((t) => used.add(t.endpoint));
    const last = [...tel].sort((a, b) => (b.lastAt ?? 0) - (a.lastAt ?? 0))[0];
    return {
      ...c,
      key: `${c.name}-${i}`,
      unavailable: /NOT AVAILABLE/i.test(c.verified),
      tel,
      calls: tel.reduce((s, t) => s + t.count, 0),
      errors: tel.reduce((s, t) => s + t.errors, 0),
      lastStatus: last?.lastStatus,
      lastLatencyMs: last?.lastLatencyMs,
      lastAt: last?.lastAt,
      lastError: tel.find((t) => t.lastError)?.lastError,
    } satisfies Joined;
  });
  return { rows, orphans: d.telemetry.filter((t) => !used.has(t.endpoint)) };
}

function StatusCell({ s }: { s: number | undefined }) {
  if (s === undefined) return <span className="muted">{DASH}</span>;
  return <Badge tone={s >= 200 && s < 300 ? 'green' : s === 0 || s >= 500 ? 'red' : 'amber'}>{s === 0 ? 'NET ERR' : s}</Badge>;
}

function Health({ d }: { d: ExchangeEndpoints }) {
  const now = useNow(1000);
  const { rows, orphans } = useMemo(() => join(d), [d]);
  const totalCalls = d.telemetry.reduce((s, t) => s + t.count, 0);
  const totalErr = d.telemetry.reduce((s, t) => s + t.errors, 0);
  const lat = d.telemetry.map((t) => t.lastLatencyMs).filter((x): x is number => typeof x === 'number');
  const restOnly = d.socket?.transport === 'rest' || !d.baseUrls.socket;
  const socketOk = !!d.socket?.connected;
  const lastMsg = typeof d.socket?.lastMessageAt === 'number' && d.socket.lastMessageAt > 0 ? d.socket.lastMessageAt : undefined;
  const brk = d.breaker?.state;
  const unavailable = rows.filter((r) => r.unavailable);

  return (
    <>
      <div className="kpis">
        <Kpi label="Authenticated" value={d.authenticated ? <span className="pos">YES</span> : <span className="warn">NO</span>} hint={d.authenticated ? 'signed endpoints enabled' : 'public data only (PAPER)'} />
        <Kpi
          label="Circuit breaker"
          value={<span className={brk === 'CLOSED' ? 'pos' : brk === 'OPEN' ? 'neg' : 'warn'}>{brk ?? DASH}</span>}
          hint={d.breaker ? `${d.breaker.failures} consecutive failures` : 'no exchange client'}
        />
        <Kpi
          label="Prices"
          value={restOnly ? <span className="pos">REST POLL</span> : socketOk ? <span className="pos">SOCKET</span> : <span className="warn">DOWN</span>}
          hint={restOnly ? 'tickers every 10s, order book when > 4s old' : lastMsg ? `last msg ${fmtAge(now - lastMsg)} ago` : 'no socket messages yet'}
        />
        <Kpi label="REST calls" value={fmtNum(totalCalls, 0)} hint={`${d.telemetry.length} endpoints`} />
        <Kpi label="Errors" value={<span className={totalErr ? 'neg' : ''}>{fmtNum(totalErr, 0)}</span>} hint={totalCalls ? `${fmtFrac(totalErr / totalCalls)} error rate` : undefined} />
        <Kpi label="Max last latency" value={lat.length ? `${fmtNum(Math.max(...lat), 0)} ms` : DASH} hint={lat.length ? `median ${fmtNum([...lat].sort((a, b) => a - b)[Math.floor(lat.length / 2)], 0)} ms` : undefined} />
      </div>

      {unavailable.map((u) => (
        <div key={u.key} className="banner banner-error unavailable-banner" role="note">
          <div>
            <strong>{u.name}: NOT AVAILABLE via the <ExName /> API in this engine.</strong> {u.usedFor}
          </div>
        </div>
      ))}

      <div className="grid grid-2">
        <Card title="Connection">
          <KV
            items={[
              ['REST API base', <span key="a" className="mono">{d.baseUrls.api ?? DASH}</span>],
              ['Public data base', <span key="p" className="mono">{d.baseUrls.public ?? d.baseUrls.api ?? DASH}</span>],
              [
                'Price transport',
                restOnly ? (
                  <span key="t">REST polling (no websocket in this engine yet)</span>
                ) : (
                  <span key="t" className="mono">{d.baseUrls.socket ?? DASH}</span>
                ),
              ],
              [
                'Stream status',
                restOnly ? (
                  <Badge key="ss" tone="blue">NOT USED</Badge>
                ) : socketOk ? (
                  <Badge key="ss" tone="green">CONNECTED</Badge>
                ) : (
                  <Badge key="ss" tone="amber">DISCONNECTED</Badge>
                ),
              ],
              [
                'Last stream message',
                restOnly ? DASH : lastMsg ? `${fmtTs(lastMsg)} (${fmtAge(now - lastMsg)} ago)` : 'never',
              ],
            ]}
          />
        </Card>
        <Card title="Circuit breaker" subtitle="Opens after repeated failures and pauses REST calls; LIVE entries are blocked while open">
          <KV
            items={[
              ['Name', d.breaker?.name ?? DASH],
              ['State', brk ? <Badge key="b" tone={brk === 'CLOSED' ? 'green' : brk === 'OPEN' ? 'red' : 'amber'}>{brk}</Badge> : DASH],
              ['Consecutive failures', d.breaker ? fmtNum(d.breaker.failures, 0) : DASH],
              ['Credentials', d.authenticated ? 'API key + secret configured' : 'not configured: signed endpoints disabled'],
            ]}
          />
        </Card>
      </div>

      <Card title="Endpoint catalogue + live telemetry" subtitle={<>Every <ExName /> endpoint the engine uses, how it was verified, and live call statistics (auto-refresh 5 s)</>}>
        <Table<Joined>
          rows={rows}
          rowKey={(r) => r.key}
          rowClassName={(r) => (r.unavailable ? 'row-unavailable' : r.errors > 0 ? 'row-alert' : '')}
          columns={[
            {
              key: 'name',
              header: 'Endpoint · used for · verification',
              className: 'wrap ep-cell',
              render: (r) => (
                <div>
                  <div className="row" style={{ gap: 6 }}>
                    <strong>{r.name}</strong>
                    {r.unavailable && <Badge tone="red">NOT AVAILABLE</Badge>}
                  </div>
                  <div className="small" style={{ marginTop: 2 }}>
                    {r.usedFor}
                  </div>
                  <div className={`small ${r.unavailable ? 'neg' : 'muted'}`} style={{ marginTop: 2 }}>
                    {r.verified}
                  </div>
                </div>
              ),
            },
            { key: 'lastStatus', header: 'Last status', render: (r) => <StatusCell s={r.lastStatus} /> },
            { key: 'calls', header: 'Calls', align: 'right', render: (r) => <span className="mono">{r.tel.length || r.calls ? fmtNum(r.calls, 0) : DASH}</span> },
            { key: 'errors', header: 'Errors', align: 'right', render: (r) => <span className={`mono ${r.errors ? 'neg' : ''}`}>{r.tel.length ? fmtNum(r.errors, 0) : DASH}</span> },
            { key: 'lastLatencyMs', header: 'Latency', align: 'right', render: (r) => <span className="mono">{r.lastLatencyMs !== undefined ? `${fmtNum(r.lastLatencyMs, 0)} ms` : DASH}</span> },
            { key: 'lastAt', header: 'Last call', render: (r) => (r.lastAt ? <span className="mono small" title={fmtTs(r.lastAt)}>{fmtAge(now - r.lastAt)} ago</span> : <span className="muted">never</span>) },
            { key: 'method', header: 'Method', render: (r) => <span className="mono small">{r.method}</span> },
            { key: 'path', header: 'Path', className: 'wrap path-cell', render: (r) => <span className="mono small">{r.path}</span> },
            { key: 'auth', header: 'Auth', render: (r) => (r.auth ? <Badge tone="purple">SIGNED</Badge> : <Badge tone="grey">PUBLIC</Badge>) },
            { key: 'lastError', header: 'Last error', className: 'wrap err-cell', sortable: false, render: (r) => (r.lastError ? <span className="neg small">{r.lastError}</span> : <span className="muted">{DASH}</span>) },
          ]}
        />
      </Card>

      <Card title="Telemetry not in the catalogue" subtitle="Calls whose path did not match any catalogued endpoint">
        <Table<EndpointTelemetry>
          dense
          rows={orphans}
          rowKey={(t) => t.endpoint}
          emptyTitle="Every recorded call matches a catalogued endpoint"
          columns={[
            { key: 'endpoint', header: 'Endpoint', className: 'wrap', render: (t) => <span className="mono small">{t.endpoint}</span> },
            { key: 'auth', header: 'Auth', render: (t) => (t.auth ? <Badge tone="purple">SIGNED</Badge> : <Badge tone="grey">PUBLIC</Badge>) },
            { key: 'count', header: 'Calls', align: 'right', render: (t) => fmtNum(t.count, 0) },
            { key: 'errors', header: 'Errors', align: 'right', render: (t) => <span className={t.errors ? 'neg' : ''}>{fmtNum(t.errors, 0)}</span> },
            { key: 'lastStatus', header: 'Last status', render: (t) => <StatusCell s={t.lastStatus} /> },
            { key: 'lastLatencyMs', header: 'Latency', align: 'right', render: (t) => (t.lastLatencyMs !== undefined ? `${fmtNum(t.lastLatencyMs, 0)} ms` : DASH) },
            { key: 'lastAt', header: 'Last call', render: (t) => (t.lastAt ? `${fmtAge(now - t.lastAt)} ago` : 'never') },
            { key: 'lastError', header: 'Last error', className: 'wrap', render: (t) => (t.lastError ? <span className="neg small">{t.lastError}</span> : DASH) },
          ]}
        />
      </Card>
    </>
  );
}

export default function ApiHealthPage() {
  const q = usePoll('exchange:endpoints', api.exchangeEndpoints, 5_000);
  return (
    <>
      <PageHeader title="Exchange API">{q.updatedAt && <span className="muted small">updated {fmtTs(q.updatedAt)}</span>}</PageHeader>
      <DataState data={q.data} error={q.error} loading={q.loading} reload={q.reload}>
        {(d) => <Health d={d} />}
      </DataState>
    </>
  );
}
