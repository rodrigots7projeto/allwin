"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";

const STORAGE_KEY = "allwin_selected_coin";
const DEFAULT_COIN = "BTCUSDT";

interface CoinCtx {
  coin: string;
  setCoin: (coin: string) => void;
}

const CoinContext = createContext<CoinCtx>({
  coin: DEFAULT_COIN,
  setCoin: () => {},
});

export function CoinProvider({ children }: { children: ReactNode }) {
  const [coin, setCoinState] = useState<string>(DEFAULT_COIN);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) setCoinState(saved);
    } catch {}
  }, []);

  function setCoin(c: string) {
    setCoinState(c);
    try { localStorage.setItem(STORAGE_KEY, c); } catch {}
  }

  return (
    <CoinContext.Provider value={{ coin, setCoin }}>
      {children}
    </CoinContext.Provider>
  );
}

export function useCoin() {
  return useContext(CoinContext);
}
