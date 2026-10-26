'use client';

import { exchangeLabel } from '@/lib/exchange';
import { useEngine } from './providers';

/** Label of the exchange this backend is connected to ("CoinDCX" / "Delta Exchange"). */
export function useExchangeLabel(): string {
  const { status } = useEngine();
  return exchangeLabel(status?.exchange);
}

export function ExName() {
  return <>{useExchangeLabel()}</>;
}
