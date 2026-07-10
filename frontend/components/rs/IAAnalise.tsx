"use client";

import { useState } from "react";
import type { RSAnaliseIA, RSAnalisaData } from "@/types";
import { IAChat } from "./IAChat";

interface Props {
  analise: RSAnaliseIA;
  empresa: string;
  dadosAtivo: RSAnalisaData;
}

function Secao({ titulo, texto, cor = "var(--text-secondary)" }: { titulo: string; texto: string; cor?: string }) {
  return (
    <div className="rounded-xl border border-[var(--border)] p-4">
      <p className="text-[11px] font-bold uppercase tracking-wider mb-2" style={{ color: cor }}>
        {titulo}
      </p>
      <p className="text-[13px] text-[var(--text-primary)] leading-relaxed">{texto}</p>
    </div>
  );
}

function Lista({ titulo, itens, corItem }: { titulo: string; itens: string[]; corItem: string }) {
  if (!itens.length) return null;
  return (
    <div className="rounded-xl border border-[var(--border)] p-4">
      <p className="text-[11px] font-bold uppercase tracking-wider mb-2 text-[var(--text-secondary)]">
        {titulo}
      </p>
      <ul className="space-y-1.5">
        {itens.map((item, i) => (
          <li key={i} className="flex gap-2 text-[12px] text-[var(--text-primary)] leading-snug">
            <span style={{ color: corItem }} className="shrink-0 mt-0.5">▸</span>
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function IAAnalise({ analise, empresa, dadosAtivo }: Props) {
  const [modoChat, setModoChat] = useState(false);

  return (
    <div className="space-y-4">
      {/* Toggle análise / chat */}
      <div className="flex gap-1.5 p-1 rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] w-fit">
        <button
          onClick={() => setModoChat(false)}
          className={`px-4 py-1.5 rounded-lg text-[12px] font-medium transition-all ${
            !modoChat
              ? "bg-[var(--bg-card)] text-[var(--text-primary)] shadow-sm"
              : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          }`}
        >
          Análise
        </button>
        <button
          onClick={() => setModoChat(true)}
          className={`px-4 py-1.5 rounded-lg text-[12px] font-medium transition-all flex items-center gap-1.5 ${
            modoChat
              ? "bg-[var(--bg-card)] text-[var(--text-primary)] shadow-sm"
              : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          }`}
        >
          <span className="w-3.5 h-3.5 rounded-full bg-emerald-500/20 flex items-center justify-center shrink-0">
            <span className="text-emerald-500 text-[7px] font-bold">IA</span>
          </span>
          Chat
        </button>
      </div>

      {modoChat ? (
        <IAChat dados={dadosAtivo} empresa={empresa} />
      ) : (
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5 space-y-4">
          {/* Header */}
          <div className="flex items-center gap-2 pb-1">
            <div className="w-6 h-6 rounded-full bg-emerald-500/20 flex items-center justify-center shrink-0">
              <span className="text-emerald-500 text-xs font-bold">IA</span>
            </div>
            <div>
              <h3 className="text-sm font-bold">Análise RS Invest</h3>
              <p className="text-[11px] text-[var(--text-secondary)]">
                Gerada com base nos dados fundamentalistas de {empresa}
              </p>
            </div>
          </div>

          {/* Resumo executivo — destaque */}
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4">
            <p className="text-[11px] font-bold text-emerald-500 uppercase tracking-wider mb-2">
              Resumo Executivo
            </p>
            <p className="text-[13px] text-[var(--text-primary)] leading-relaxed">
              {analise.resumo_executivo}
            </p>
          </div>

          {/* Grid 2 colunas */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Secao titulo="Situação Financeira"  texto={analise.situacao_financeira} />
            <Secao titulo="Qualidade dos Lucros" texto={analise.qualidade_lucros} />
            <Secao titulo="Crescimento"           texto={analise.crescimento} />
            <Secao titulo="Endividamento"         texto={analise.endividamento} />
            <Secao titulo="Dividendos"            texto={analise.dividendos} />
            <Secao titulo="Perspectivas"          texto={analise.perspectivas} cor="#3b82f6" />
          </div>

          {/* Pontos fortes / fracos / riscos */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Lista titulo="Pontos Fortes"      itens={analise.pontos_fortes} corItem="#10b981" />
            <Lista titulo="Pontos de Atenção"  itens={analise.pontos_fracos} corItem="#f59e0b" />
            <Lista titulo="Fatores de Risco"   itens={analise.riscos}        corItem="#ef4444" />
          </div>

          <p className="text-[10px] text-[var(--text-secondary)] opacity-60 text-center pt-1">
            Esta análise é gerada automaticamente a partir de dados públicos e não constitui recomendação de investimento.
          </p>
        </div>
      )}
    </div>
  );
}
