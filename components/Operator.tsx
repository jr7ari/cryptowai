'use client';

import { useId, useState } from 'react';
import { clearOperator, getOperatorName, getOperatorToken, setOperator, useOperator } from '@/lib/operator';
import { Modal } from './Modal';

/** Header control for the operator token (kept only in sessionStorage). */
export function OperatorControl() {
  const { hasToken, name } = useOperator();
  const [open, setOpen] = useState(false);
  const [token, setToken] = useState('');
  const [nm, setNm] = useState('');
  const tid = useId();
  const nid = useId();

  const openDialog = () => {
    setToken('');
    setNm(getOperatorName());
    setOpen(true);
  };

  return (
    <>
      <button
        type="button"
        className={`btn btn-sm operator-btn ${hasToken ? 'set' : ''}`}
        onClick={openDialog}
        aria-haspopup="dialog"
        title={hasToken ? `Operator token set${name ? ` (${name})` : ''}` : 'Operator token: required for LIVE actions only'}
      >
        <span className={`dot ${hasToken ? 'dot-green' : 'dot-grey'}`} aria-hidden />
        {hasToken ? name || 'Operator' : 'Operator'}
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Operator credentials"
        footer={
          <>
            {hasToken && (
              <button
                type="button"
                className="btn"
                onClick={() => {
                  clearOperator();
                  setOpen(false);
                }}
              >
                Clear
              </button>
            )}
            <button type="button" className="btn" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button
              type="submit"
              form="operator-form"
              className="btn btn-primary"
              disabled={!token && !hasToken}
            >
              Save for this tab
            </button>
          </>
        }
      >
        <form
          id="operator-form"
          onSubmit={(e) => {
            e.preventDefault();
            // empty token field keeps the existing token (only the name changes)
            setOperator(token || (hasToken ? getOperatorToken() : ''), nm.trim());
            setToken('');
            setOpen(false);
          }}
        >
          <p className="muted">
            The token is stored in this browser tab’s <code>sessionStorage</code> only, is sent as <code>X-Operator-Token</code> on actions, and is cleared
            when the tab closes.
          </p>
          <div className="field">
            <label htmlFor={tid} className="field-label">
              Operator token {hasToken && <span className="muted">(leave blank to keep current)</span>}
            </label>
            <input id={tid} className="input mono" type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor={nid} className="field-label">
              Operator name (audit log)
            </label>
            <input id={nid} className="input" autoComplete="off" value={nm} onChange={(e) => setNm(e.target.value)} placeholder="e.g. alice" />
          </div>
        </form>
      </Modal>
    </>
  );
}
