import type { ExchangeId } from './types';

export const EXCHANGE_LABEL: Record<ExchangeId, string> = { coindcx: 'CoinDCX', delta: 'Delta Exchange' };

/** Exchange the backend reports; falls back to the one `npm run dev` started the dashboard with. */
export function exchangeLabel(id?: string | null): string {
  const e = (id ?? process.env.NEXT_PUBLIC_EXCHANGE ?? 'coindcx') as ExchangeId;
  return EXCHANGE_LABEL[e] ?? 'CoinDCX';
}

/** Positions created before multi-exchange support have no tag and belong to CoinDCX. */
export function positionExchange(p: { exchange?: string | null }): ExchangeId {
  return (p.exchange as ExchangeId) ?? 'coindcx';
}
