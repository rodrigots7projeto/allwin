"use client";

import { useEffect, useRef, useState } from "react";
import type { TipoOperacao } from "@/types";
import { useCarteira } from "@/contexts/CarteiraContext";

interface Props {
  ticker: string;
  nome?: string;
  onClose: () => void;
}

const TIPOS: { value: TipoOperacao; label: string; cor: string }[] = [
  { value: "compra",    label: "Compra",    cor: "bg-emerald-500 text-white" },
  { value: "venda",     label: "Venda",     cor: "bg-red-500 text-white" },
  { value: "dividendo", label: "Dividendo", cor: "bg-blue-500 text-white" },
  { value: "jcp",       label: "JCP",       cor: "bg-violet-500 text-white" },
];

export function AddCarteiraModal({ ticker, nome, onClose }: Props) {
  const { addOp } = useCarteira();
  const [tipo, setTipo] = useState<TipoOperacao>("compra");
  const [quantidade, setQuantidade] = useState("");
  const [preco, setPreco] = useState("");
  const [data, setData] = useState(new Date().toISOString().slice(0, 10));
  const [corretagem, setCorretagem] = useState("");
  const [obs, setObs] = useState("");
  const [saved, setSaved] = useState(false);
  const firstInput = useRef<HTMLInputElement>(null);

  useEffect(() => { firstInput.current?.focus(); }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  const totalCalc =
    quantidade && preco
      ? (parseFloat(quantidade) * parseFloat(preco)).toLocaleString("pt-BR", { minimumFractionDigits: 2 })
      : null;

  function salvar(e: React.FormEvent) {
    e.preventDefault();
    const qtd = parseFloat(quantidade);
    const pr = parseFloat(preco);
    if (!qtd || qtd <= 0 || !pr || pr <= 0) return;

    addOp({
      ticker,
      tipo,
      quantidade: qtd,
      preco_unitario: pr,
      data,
      corretagem: parseFloat(corretagem) || 0,
      observacao: obs.trim(),
    });
    setSaved(true);
    setTimeout(() => onClose(), 1000);
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl w-full max-w-md shadow-2xl animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
          <div>
            <h2 className="font-bold text-[var(--text-primary)] text-base">Adicionar à Carteira</h2>
            <p className="text-xs text-[var(--text-secondary)] mt-0.5">
              <span className="font-mono font-semibold text-emerald-500">{ticker}</span>
              {nome ? <span className="ml-1.5 opacity-70">· {nome}</span> : null}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors rounded-lg p-1.5 hover:bg-[var(--border)]/30"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
              <path d="M12 4L4 12M4 4l8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        {saved ? (
          <div className="p-10 text-center">
            <div className="text-4xl mb-3">✅</div>
            <p className="font-semibold text-emerald-500 text-lg">Registrado com sucesso!</p>
            <p className="text-sm text-[var(--text-secondary)] mt-1">{ticker} adicionado à carteira</p>
          </div>
        ) : (
          <form onSubmit={salvar} className="p-5 space-y-4">
            {/* Tipo */}
            <div>
              <label className="text-[11px] uppercase tracking-wider font-semibold text-[var(--text-secondary)] mb-2 block">
                Tipo de Operação
              </label>
              <div className="flex gap-2 flex-wrap">
                {TIPOS.map((t) => (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => setTipo(t.value)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                      tipo === t.value
                        ? t.cor
                        : "bg-[var(--border)]/25 text-[var(--text-secondary)] hover:bg-[var(--border)]/50"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Quantidade + Preço */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-[var(--text-secondary)] mb-1.5 block">
                  {tipo === "dividendo" || tipo === "jcp" ? "Qtd. de ações" : "Quantidade"}
                </label>
                <input
                  ref={firstInput}
                  required
                  type="number"
                  min="0.001"
                  step="any"
                  value={quantidade}
                  onChange={(e) => setQuantidade(e.target.value)}
                  placeholder="100"
                  className="w-full px-3 py-2.5 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-primary)] text-sm focus:outline-none focus:border-emerald-500/60 transition-colors placeholder:text-[var(--text-secondary)]/40"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-[var(--text-secondary)] mb-1.5 block">
                  {tipo === "dividendo" || tipo === "jcp" ? "Valor por ação (R$)" : "Preço médio (R$)"}
                </label>
                <input
                  required
                  type="number"
                  min="0.001"
                  step="any"
                  value={preco}
                  onChange={(e) => setPreco(e.target.value)}
                  placeholder="25,50"
                  className="w-full px-3 py-2.5 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-primary)] text-sm focus:outline-none focus:border-emerald-500/60 transition-colors placeholder:text-[var(--text-secondary)]/40"
                />
              </div>
            </div>

            {/* Total preview */}
            {totalCalc && (
              <div className="text-xs px-1 flex justify-between items-center">
                <span className="text-[var(--text-secondary)]">
                  {tipo === "dividendo" || tipo === "jcp" ? "Total de proventos:" : "Valor total:"}
                </span>
                <span className="font-bold text-[var(--text-primary)] text-sm">R$ {totalCalc}</span>
              </div>
            )}

            {/* Data */}
            <div>
              <label className="text-xs font-medium text-[var(--text-secondary)] mb-1.5 block">Data</label>
              <input
                type="date"
                required
                value={data}
                onChange={(e) => setData(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-primary)] text-sm focus:outline-none focus:border-emerald-500/60 transition-colors"
              />
            </div>

            {/* Corretagem + Observação */}
            {(tipo === "compra" || tipo === "venda") && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-[var(--text-secondary)] mb-1.5 block">Corretagem (R$)</label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={corretagem}
                    onChange={(e) => setCorretagem(e.target.value)}
                    placeholder="0,00"
                    className="w-full px-3 py-2.5 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-primary)] text-sm focus:outline-none focus:border-emerald-500/60 transition-colors placeholder:text-[var(--text-secondary)]/40"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-[var(--text-secondary)] mb-1.5 block">Observação</label>
                  <input
                    type="text"
                    value={obs}
                    onChange={(e) => setObs(e.target.value)}
                    placeholder="Opcional"
                    className="w-full px-3 py-2.5 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-primary)] text-sm focus:outline-none focus:border-emerald-500/60 transition-colors placeholder:text-[var(--text-secondary)]/40"
                  />
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-3 pt-1">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 px-4 py-2.5 rounded-xl border border-[var(--border)] text-[var(--text-secondary)] text-sm hover:bg-[var(--border)]/30 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="flex-1 px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-semibold transition-colors"
              >
                Salvar
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
