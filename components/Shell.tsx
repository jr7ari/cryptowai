'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { fmtAge, fmtMoney, fmtPct, pnlClass, shortSymbol } from '@/lib/format';
import { API_URL } from '@/lib/api';
import { exchangeLabel } from '@/lib/exchange';
import { useEngine } from './providers';
import { Badge, ErrorBanner } from './ui';
import { KillSwitchButton } from './KillSwitch';
import { OperatorControl } from './Operator';

const NAV: Array<{ href: string; label: string; icon: string }> = [
  { href: '/', label: 'Overview', icon: '◧' },
  { href: '/market', label: 'Market', icon: '₿' },
  { href: '/api-health', label: 'Exchange API', icon: '⇄' },
  { href: '/regimes', label: 'Regimes', icon: '◐' },
  { href: '/indicators', label: 'Indicators', icon: '≋' },
  { href: '/strategies', label: 'Strategies', icon: '◆' },
  { href: '/journal', label: 'Journal', icon: '☰' },
  { href: '/risk', label: 'Risk', icon: '⚠' },
  { href: '/learning', label: 'Learning', icon: '⟳' },
  { href: '/backtest', label: 'Backtest', icon: '⏱' },
  { href: '/live', label: 'LIVE control', icon: '●' },
];

/** Data age thresholds (ms): matches the engine's default staleDataMs of 20s. */
const FRESH_MS = 20_000;

function Sidebar({ open, onNavigate }: { open: boolean; onNavigate: () => void }) {
  const path = usePathname();
  return (
    <nav className={`sidebar ${open ? 'open' : ''}`} aria-label="Main navigation">
      <div className="brand">
        <span className="brand-mark" aria-hidden>
          ◈
        </span>
        <span>crypto-hacks</span>
      </div>
      <ul>
        {NAV.map((n) => {
          const active = n.href === '/' ? path === '/' : path?.startsWith(n.href);
          return (
            <li key={n.href}>
              <Link href={n.href} className={`nav-link ${active ? 'active' : ''} ${n.href === '/live' ? 'nav-live' : ''}`} aria-current={active ? 'page' : undefined} onClick={onNavigate}>
                <span className="nav-icon" aria-hidden>
                  {n.icon}
                </span>
                {n.label}
              </Link>
            </li>
          );
        })}
      </ul>
      <div className="sidebar-foot muted">
        API: <span className="mono">{API_URL.replace(/^https?:\/\//, '')}</span>
      </div>
    </nav>
  );
}

function StatusBar({ onMenu }: { onMenu: () => void }) {
  const { status, statusError, streamConnected } = useEngine();
  const mode = status?.mode;
  const acct = mode ? status?.accounts[mode] : undefined;
  const dailyPnlPct = acct && acct.dayStartEquity > 0 ? ((acct.equity - acct.dayStartEquity) / acct.dayStartEquity) * 100 : undefined;
  const ks = status?.killSwitch;

  return (
    <header className="statusbar" aria-label="Engine status">
      <button type="button" className="btn btn-ghost menu-btn" onClick={onMenu} aria-label="Toggle navigation">
        ☰
      </button>
      <div className="sb-items">
        <div className="sb-item" title="Exchange chosen at startup (npm run dev). Restart to switch.">
          <span className="sb-label">Exchange</span>
          <Badge tone={status?.exchange === 'delta' ? 'amber' : 'blue'}>{exchangeLabel(status?.exchange)}</Badge>
        </div>
        <div className="sb-item">
          {mode === 'LIVE' ? (
            <Badge tone="red" pulse title="LIVE trading armed">
              LIVE
            </Badge>
          ) : mode === 'PAPER' ? (
            <Badge tone="blue">PAPER</Badge>
          ) : (
            <Badge tone="grey">—</Badge>
          )}
        </div>
        <div className="sb-item">
          <span className="sb-label">Kill</span>
          {ks ? (
            ks.engaged ? (
              <Badge tone="red" title={`${ks.kind ?? ''}: ${ks.reason ?? ''}`}>
                ENGAGED{ks.kind ? ` · ${ks.kind}` : ''}
              </Badge>
            ) : (
              <Badge tone="green">OFF</Badge>
            )
          ) : (
            <span className="muted">—</span>
          )}
        </div>
        <div className="sb-item">
          <span className="sb-label">Equity</span>
          <span className="mono">{fmtMoney(acct?.equity)}</span>
        </div>
        <div className="sb-item">
          <span className="sb-label">Day</span>
          <span className={`mono ${pnlClass(dailyPnlPct)}`}>{fmtPct(dailyPnlPct, { sign: true })}</span>
        </div>
        <div className="sb-item">
          <span className="sb-label">DD</span>
          <span className={`mono ${acct && acct.drawdownPct > 5 ? 'warn' : ''}`}>{fmtPct(acct?.drawdownPct)}</span>
        </div>
        <div className="sb-item sb-fresh" aria-label="Market data freshness">
          <span className="sb-label">Data</span>
          {status ? (
            Object.entries(status.dataAgeMs).map(([s, age]) => {
              const known = typeof age === 'number' && Number.isFinite(age);
              const cls = !known ? 'dead' : age <= FRESH_MS ? 'ok' : age <= FRESH_MS * 3 ? 'stale' : 'dead';
              return (
                <span key={s} className={`fresh ${cls}`} title={known ? `${s}: last update ${fmtAge(age)} ago` : `${s}: no market data received`}>
                  {shortSymbol(s)} {known ? fmtAge(age) : 'no data'}
                </span>
              );
            })
          ) : (
            <span className="muted">—</span>
          )}
        </div>
        <div className="sb-item sb-lease">
          <span className="sb-label">Lease</span>
          {status ? (
            status.hasLease ? (
              <Badge tone={status.paused ? 'amber' : 'green'}>{status.paused ? 'PAUSED' : 'HELD'}</Badge>
            ) : (
              <Badge tone="red">NONE</Badge>
            )
          ) : (
            <span className="muted">—</span>
          )}
        </div>
        <div className="sb-item sb-model">
          <span className="sb-label">Model</span>
          <span className="mono small" title="Active model in PAPER / LIVE">
            P:{status?.models.paper ?? '—'} · L:{status?.models.live ?? '—'}
          </span>
        </div>
        <div className="sb-item">
          <span className={`dot ${streamConnected ? 'dot-green' : statusError ? 'dot-red' : 'dot-amber'}`} aria-hidden />
          <span className="small muted">{streamConnected ? 'stream' : statusError ? 'offline' : 'polling'}</span>
        </div>
      </div>
      <div className="sb-actions">
        <OperatorControl />
        <KillSwitchButton />
      </div>
    </header>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const [menu, setMenu] = useState(false);
  const { statusError, status } = useEngine();
  const path = usePathname();
  useEffect(() => setMenu(false), [path]);

  return (
    <div className="shell">
      <div className="sidebar-col">
        <Sidebar open={menu} onNavigate={() => setMenu(false)} />
      </div>
      {menu && <div className="sidebar-scrim" onClick={() => setMenu(false)} aria-hidden />}
      <div className="main-col">
        <StatusBar onMenu={() => setMenu((m) => !m)} />
        {statusError && (
          <div className="global-banner">
            <ErrorBanner error={statusError} />
          </div>
        )}
        {status?.killSwitch.engaged && (
          <div className="global-banner">
            <div className="banner banner-error" role="alert">
              <div>
                <strong>Kill switch ENGAGED</strong> ({status.killSwitch.kind}) — {status.killSwitch.reason}. New entries are blocked.
              </div>
              <Link href="/risk" className="btn btn-sm">
                Risk panel
              </Link>
            </div>
          </div>
        )}
        <main className="content" id="main">
          {children}
        </main>
        <footer className="footer" role="contentinfo">
          Paper/backtest results and self-improvement do not guarantee profitability. Options can lose the entire premium; futures and short options can
          lose more. Not financial advice.
        </footer>
      </div>
    </div>
  );
}
