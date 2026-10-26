'use client';

/**
 * Operator credentials live ONLY in sessionStorage (cleared when the tab closes).
 * They are never logged, never put in URLs, and only sent as headers on mutating requests.
 */
import { useEffect, useState } from 'react';

const TOKEN_KEY = 'ch.operatorToken';
const NAME_KEY = 'ch.operatorName';
const EVENT = 'ch:operator-changed';

function store(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.sessionStorage : null;
  } catch {
    return null;
  }
}

export function getOperatorToken(): string {
  return store()?.getItem(TOKEN_KEY) ?? '';
}

export function getOperatorName(): string {
  return store()?.getItem(NAME_KEY) ?? '';
}

export function setOperator(token: string, name: string): void {
  const s = store();
  if (!s) return;
  const t = token.trim();
  const n = name.trim();
  if (t) s.setItem(TOKEN_KEY, t);
  else s.removeItem(TOKEN_KEY);
  if (n) s.setItem(NAME_KEY, n);
  else s.removeItem(NAME_KEY);
  window.dispatchEvent(new Event(EVENT));
}

export function clearOperator(): void {
  setOperator('', '');
}

/** Reactive view of operator presence (never exposes the token value to render code). */
export function useOperator(): { hasToken: boolean; name: string } {
  const [state, setState] = useState({ hasToken: false, name: '' });
  useEffect(() => {
    const read = () => setState({ hasToken: !!getOperatorToken(), name: getOperatorName() });
    read();
    window.addEventListener(EVENT, read);
    return () => window.removeEventListener(EVENT, read);
  }, []);
  return state;
}
