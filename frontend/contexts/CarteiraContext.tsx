"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { CarteiraFavorito, OperacaoCarteira, PosicaoCarteira } from "@/types";
import {
  addOperacao, editOperacao, deleteOperacao, getOperacoes,
  toggleFav, getFavs, calcularPosicoes, seedCarteiraInicial,
} from "@/lib/carteira-store";

interface CarteiraCtx {
  operacoes: OperacaoCarteira[];
  favoritos: CarteiraFavorito[];
  posicoes: PosicaoCarteira[];
  addOp: (op: Omit<OperacaoCarteira, "id" | "timestamp">) => void;
  editOp: (id: string, patch: Partial<Omit<OperacaoCarteira, "id" | "timestamp">>) => void;
  deleteOp: (id: string) => void;
  toggleFavorito: (ticker: string, nome?: string) => boolean;
  eFavorito: (ticker: string) => boolean;
  naCarteira: (ticker: string) => boolean;
  refresh: () => void;
}

const Ctx = createContext<CarteiraCtx | null>(null);

export function CarteiraProvider({ children }: { children: React.ReactNode }) {
  const [operacoes, setOperacoes] = useState<OperacaoCarteira[]>([]);
  const [favoritos, setFavoritos] = useState<CarteiraFavorito[]>([]);
  const [posicoes, setPosicoes] = useState<PosicaoCarteira[]>([]);

  const refresh = useCallback(() => {
    const ops = getOperacoes();
    const favs = getFavs();
    setOperacoes(ops);
    setFavoritos(favs);
    setPosicoes(calcularPosicoes(ops));
  }, []);

  useEffect(() => {
    seedCarteiraInicial();
    refresh();
    const handler = () => refresh();
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, [refresh]);

  const addOp = useCallback((op: Omit<OperacaoCarteira, "id" | "timestamp">) => {
    addOperacao(op);
    refresh();
  }, [refresh]);

  const editOp = useCallback((id: string, patch: Partial<Omit<OperacaoCarteira, "id" | "timestamp">>) => {
    editOperacao(id, patch);
    refresh();
  }, [refresh]);

  const deleteOp = useCallback((id: string) => {
    deleteOperacao(id);
    refresh();
  }, [refresh]);

  const toggleFavorito = useCallback((ticker: string, nome?: string) => {
    const result = toggleFav(ticker, nome);
    refresh();
    return result;
  }, [refresh]);

  const eFavorito = useCallback((ticker: string) => {
    return favoritos.some((f) => f.ticker === ticker);
  }, [favoritos]);

  const naCarteira = useCallback((ticker: string) => {
    return posicoes.some((p) => p.ticker === ticker);
  }, [posicoes]);

  return (
    <Ctx.Provider value={{ operacoes, favoritos, posicoes, addOp, editOp, deleteOp, toggleFavorito, eFavorito, naCarteira, refresh }}>
      {children}
    </Ctx.Provider>
  );
}

export function useCarteira() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useCarteira must be used within CarteiraProvider");
  return ctx;
}
