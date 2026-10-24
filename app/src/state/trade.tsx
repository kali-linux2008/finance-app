// Het handelsvenster openen vanaf elke plek (Handelen-knop, Kopen/Verkopen op een detailscherm).
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import type { Side } from '../lib/trade';

export type TradeTarget = { posId: string | null; side: Side; key: number };

type TradeState = {
  target: TradeTarget | null;
  openTrade: (posId?: string | null, side?: Side) => void;
  closeTrade: () => void;
};

const Ctx = createContext<TradeState | null>(null);

export function TradeProvider({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<TradeTarget | null>(null);
  const openTrade = useCallback((posId: string | null = null, side: Side = 'kopen') => {
    setTarget((t) => ({ posId, side, key: (t?.key ?? 0) + 1 }));
  }, []);
  const closeTrade = useCallback(() => setTarget(null), []);
  const value = useMemo(() => ({ target, openTrade, closeTrade }), [target, openTrade, closeTrade]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTrade(): TradeState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useTrade buiten TradeProvider');
  return v;
}
