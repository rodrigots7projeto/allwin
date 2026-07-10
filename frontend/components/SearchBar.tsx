"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const TICKERS_TESTE = ["PETR4", "VALE3", "ITUB4", "MGLU3"];

export function SearchBar() {
  const [valor, setValor] = useState("");
  const router = useRouter();

  function navegar(ticker: string) {
    if (ticker.trim()) {
      router.push(`/ativo/${ticker.trim().toUpperCase()}`);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    navegar(valor);
  }

  return (
    <div className="w-full max-w-xl">
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="text"
          value={valor}
          onChange={(e) => setValor(e.target.value.toUpperCase())}
          placeholder="Digite o ticker: PETR4, VALE3…"
          maxLength={10}
          className="flex-1 px-4 py-3 rounded-xl border border-[var(--border)]
                     bg-[var(--bg-card)] text-[var(--text-primary)]
                     placeholder:text-[var(--text-secondary)]
                     focus:outline-none focus:ring-2 focus:ring-emerald-500
                     text-lg font-mono tracking-wider"
        />
        <button
          type="submit"
          disabled={!valor.trim()}
          className="px-6 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-600
                     text-white font-semibold transition-colors
                     disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Analisar
        </button>
      </form>

      <div className="mt-4 flex items-center gap-2 flex-wrap">
        <span className="text-xs text-[var(--text-secondary)]">
          Tickers de teste (sem token):
        </span>
        {TICKERS_TESTE.map((t) => (
          <button
            key={t}
            onClick={() => navegar(t)}
            className="text-xs font-mono px-2 py-1 rounded border border-[var(--border)]
                       text-emerald-500 hover:bg-emerald-500/10 transition-colors"
          >
            {t}
          </button>
        ))}
      </div>
    </div>
  );
}
