'use client';

import { useId, useState } from 'react';
import { api } from '@/lib/api';
import { useOperator } from '@/lib/operator';
import { ConfirmDialog } from './Modal';
import { useAction, useEngine } from './providers';

export function EngageKillSwitchDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [reason, setReason] = useState('');
  const [flatten, setFlatten] = useState(false);
  const { run, busy } = useAction();
  const { refreshStatus } = useEngine();
  const rid = useId();
  const fid = useId();
  return (
    <ConfirmDialog
      open={open}
      onClose={onClose}
      danger
      busy={!!busy}
      title="Engage KILL SWITCH"
      confirmLabel={flatten ? 'ENGAGE + FLATTEN ALL' : 'ENGAGE KILL SWITCH'}
      onConfirm={async () => {
        const r = await run('Kill switch', () => api.killSwitch({ action: 'engage', reason: reason.trim() || 'manual (dashboard)', flatten }), () => 'Kill switch ENGAGED');
        if (r) {
          setReason('');
          setFlatten(false);
          onClose();
          void refreshStatus();
        }
      }}
    >
      <p>
        Stops all new entries immediately. Engage never needs a token. In PAPER, release works from this dashboard; LIVE still requires the operator token.
      </p>
      <div className="field">
        <label htmlFor={rid} className="field-label">
          Reason
        </label>
        <input id={rid} className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. exchange instability" />
      </div>
      <label htmlFor={fid} className="check danger-check">
        <input id={fid} type="checkbox" checked={flatten} onChange={(e) => setFlatten(e.target.checked)} />
        <span>
          <strong>Flatten all positions</strong> — close every open PAPER and LIVE position at market and cancel working orders.
        </span>
      </label>
    </ConfirmDialog>
  );
}

export function ReleaseKillSwitchDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [reason, setReason] = useState('');
  const { run, busy } = useAction();
  const { refreshStatus } = useEngine();
  const { hasToken } = useOperator();
  const { status } = useEngine();
  const live = status?.mode === 'LIVE';
  const rid = useId();
  return (
    <ConfirmDialog
      open={open}
      onClose={onClose}
      busy={!!busy}
      title="Release kill switch"
      confirmLabel="Release"
      onConfirm={async () => {
        const r = await run('Release kill switch', () => api.killSwitch({ action: 'release', reason: reason.trim() || 'manual release (dashboard)' }), () => 'Kill switch released');
        if (r) {
          setReason('');
          onClose();
          void refreshStatus();
        }
      }}
    >
      {live && !hasToken && <div className="banner banner-warn compact">LIVE release needs an operator token. Set it via “Operator” in the header.</div>}
      <p>Trading resumes on the next decision cycle once released. Make sure the cause has been resolved.</p>
      <div className="field">
        <label htmlFor={rid} className="field-label">
          Release note
        </label>
        <input id={rid} className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="what was fixed" />
      </div>
    </ConfirmDialog>
  );
}

export function KillSwitchButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="btn btn-kill" onClick={() => setOpen(true)} aria-haspopup="dialog">
        KILL SWITCH
      </button>
      <EngageKillSwitchDialog open={open} onClose={() => setOpen(false)} />
    </>
  );
}
