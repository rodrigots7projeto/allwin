"use client";

import { useState } from "react";
import { useCarteira } from "@/contexts/CarteiraContext";
import { AddCarteiraModal } from "./AddCarteiraModal";

interface Props {
  ticker: string;
  nome?: string;
  className?: string;
}

export function CarteiraBotoes({ ticker, nome, className = "" }: Props) {
  const { eFavorito, naCarteira, toggleFavorito } = useCarteira();
  const fav = eFavorito(ticker);
  const emCarteira = naCarteira(ticker);
  const [showModal, setShowModal] = useState(false);

  return (
    <>
      <div className={`flex gap-2 ${className}`}>
        {/* Favoritar */}
        <button
          type="button"
          onClick={() => toggleFavorito(ticker, nome)}
          title={fav ? "Remover dos favoritos" : "Adicionar aos favoritos"}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-sm font-medium transition-all select-none ${
            fav
              ? "bg-red-500/12 border-red-500/40 text-red-400 hover:bg-red-500/20"
              : "border-[var(--border)] text-[var(--text-secondary)] hover:border-red-400/50 hover:text-red-400 hover:bg-red-500/8"
          }`}
        >
          <span className="text-base leading-none">{fav ? "❤️" : "🤍"}</span>
          <span className="hidden sm:inline text-xs">{fav ? "Favoritado" : "Favoritar"}</span>
        </button>

        {/* Adicionar à Carteira */}
        <button
          type="button"
          onClick={() => setShowModal(true)}
          title={emCarteira ? "Já está na carteira · Clique para adicionar mais" : "Adicionar à carteira"}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-sm font-medium transition-all select-none ${
            emCarteira
              ? "bg-emerald-500/12 border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/20"
              : "border-[var(--border)] text-[var(--text-secondary)] hover:border-emerald-500/50 hover:text-emerald-400 hover:bg-emerald-500/8"
          }`}
        >
          <span className="text-base leading-none">{emCarteira ? "✅" : "➕"}</span>
          <span className="hidden sm:inline text-xs">{emCarteira ? "Na Carteira" : "Add Carteira"}</span>
        </button>
      </div>

      {showModal && (
        <AddCarteiraModal ticker={ticker} nome={nome} onClose={() => setShowModal(false)} />
      )}
    </>
  );
}
