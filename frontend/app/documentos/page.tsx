"use client";

import { useState, useCallback } from "react";
import type { RSAnalisaData } from "@/types";
import {
  getRSAnalisa,
  postDocumentos,
  type DocumentoCVM,
  type DocumentosResult,
} from "@/lib/api";

// ── Helpers ───────────────────────────────────────────────────────────────────

const SENTIMENTO_CONFIG = {
  positivo: { label: "Positivo", bg: "bg-emerald-500/10", border: "border-emerald-500/30", text: "text-emerald-400", dot: "bg-emerald-500" },
  negativo: { label: "Negativo", bg: "bg-red-500/10",     border: "border-red-500/30",     text: "text-red-400",     dot: "bg-red-500" },
  neutro:   { label: "Neutro",   bg: "bg-slate-500/10",   border: "border-slate-500/30",   text: "text-slate-400",   dot: "bg-slate-400" },
} as const;

const CATEG_ICON: Record<string, string> = {
  "Fato Relevante":        "⚡",
  "DFP":                   "📊",
  "ITR":                   "📈",
  "FRE":                   "📋",
  "Comunicado ao Mercado": "📢",
  "Aviso aos Acionistas":  "📬",
  "Assembleia":            "🗳️",
};

function formatDate(s: string): string {
  if (!s) return "—";
  const [y, m, d] = s.split(/[-/]/);
  return `${d || ""}/${m || ""}/${y || ""}`;
}

function catIcone(cat: string): string {
  for (const [k, v] of Object.entries(CATEG_ICON)) {
    if (cat.startsWith(k)) return v;
  }
  return "📄";
}

// ── Card de documento ─────────────────────────────────────────────────────────

function DocCard({ doc }: { doc: DocumentoCVM }) {
  const [aberto, setAberto] = useState(false);
  const sentCfg = doc.sentimento ? SENTIMENTO_CONFIG[doc.sentimento] : SENTIMENTO_CONFIG.neutro;
  const icone = catIcone(doc.categoria);

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] overflow-hidden">
      <button
        className="w-full px-4 py-3 text-left flex items-start gap-3"
        onClick={() => setAberto(v => !v)}
      >
        {/* Ícone categoria */}
        <span className="text-lg shrink-0 mt-0.5">{icone}</span>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {/* Categoria badge */}
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--bg-secondary)] border border-[var(--border)] text-[var(--text-secondary)] font-medium shrink-0">
              {doc.categoria}
            </span>
            {/* Sentimento badge */}
            {doc.sentimento && (
              <span className={`text-[10px] px-2 py-0.5 rounded-full border ${sentCfg.border} ${sentCfg.bg} ${sentCfg.text} font-medium flex items-center gap-1 shrink-0`}>
                <span className={`w-1.5 h-1.5 rounded-full ${sentCfg.dot}`} />
                {sentCfg.label}
              </span>
            )}
          </div>
          <p className="text-[13px] font-medium text-[var(--text-primary)] mt-1 leading-tight truncate">
            {doc.descricao || "Sem descrição"}
          </p>
          <p className="text-[11px] text-[var(--text-secondary)] mt-0.5">
            {formatDate(doc.data_recebimento)}
            {doc.data_referencia && doc.data_referencia !== doc.data_recebimento && (
              <span className="ml-2">ref. {formatDate(doc.data_referencia)}</span>
            )}
          </p>
        </div>

        {/* Chevron */}
        <svg
          className={`w-4 h-4 shrink-0 text-[var(--text-secondary)] transition-transform mt-1 ${aberto ? "rotate-180" : ""}`}
          viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {aberto && (
        <div className="px-4 pb-4 border-t border-[var(--border)]/50 pt-3 space-y-3">
          {/* Resumo executivo */}
          {doc.resumo_executivo ? (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-secondary)] mb-1.5">
                Resumo Executivo
              </p>
              <p className="text-[12px] text-[var(--text-primary)] leading-relaxed">
                {doc.resumo_executivo}
              </p>
            </div>
          ) : (
            <p className="text-[12px] text-[var(--text-secondary)] italic">
              Resumo indisponível — configure OPENAI_API_KEY para gerar análise automática.
            </p>
          )}

          {/* Impacto esperado */}
          {doc.impacto_esperado && (
            <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2">
              <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-secondary)] mb-1">
                Impacto Esperado
              </p>
              <p className="text-[12px] text-[var(--text-primary)]">{doc.impacto_esperado}</p>
            </div>
          )}

          {/* Tópicos */}
          {doc.topicos.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {doc.topicos.map(t => (
                <span key={t} className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--bg-secondary)] border border-[var(--border)] text-[var(--text-secondary)]">
                  {t}
                </span>
              ))}
            </div>
          )}

          {/* Link */}
          {doc.link && (
            <a
              href={doc.link}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-[11px] text-blue-400 hover:text-blue-300 transition-colors"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14 21 3" />
              </svg>
              Abrir documento na CVM
            </a>
          )}
        </div>
      )}
    </div>
  );
}

// ── Página principal ──────────────────────────────────────────────────────────

export default function DocumentosPage() {
  const [inputTicker, setInputTicker] = useState("");
  const [loading, setLoading]         = useState(false);
  const [resultado, setResultado]     = useState<DocumentosResult | null>(null);
  const [dados, setDados]             = useState<RSAnalisaData | null>(null);
  const [erro, setErro]               = useState<string | null>(null);
  const [filtroSent, setFiltroSent]   = useState<string>("todos");

  const buscar = useCallback(async () => {
    const t = inputTicker.trim().toUpperCase();
    if (!t) return;
    setLoading(true);
    setErro(null);
    setResultado(null);
    setDados(null);
    try {
      const rsData = await getRSAnalisa(t);
      setDados(rsData);
      const docs = await postDocumentos(t, rsData.empresa, rsData, 15, 2, true);
      setResultado(docs);
    } catch (e: unknown) {
      const err = e as { message?: string };
      setErro(err.message ?? "Erro ao buscar documentos.");
    } finally {
      setLoading(false);
    }
  }, [inputTicker]);

  const docsFiltrados = resultado?.documentos.filter(d => {
    if (filtroSent === "todos") return true;
    return d.sentimento === filtroSent;
  }) ?? [];

  const countSent = (s: string) => resultado?.documentos.filter(d => d.sentimento === s).length ?? 0;

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-[var(--text-primary)]">Documentos CVM</h1>
        <p className="text-sm text-[var(--text-secondary)] mt-1">
          Fatos relevantes, ITR, DFP e comunicados recentes com resumo automático por IA
        </p>
      </div>

      {/* Busca */}
      <form
        onSubmit={e => { e.preventDefault(); void buscar(); }}
        className="flex gap-2"
      >
        <input
          type="text"
          value={inputTicker}
          onChange={e => setInputTicker(e.target.value.toUpperCase())}
          placeholder="Digite o ticker (ex: PETR4, WEGE3, BBAS3…)"
          maxLength={8}
          className="flex-1 rounded-xl border border-[var(--border)] bg-[var(--bg-card)]
            px-4 py-3 text-[14px] text-[var(--text-primary)] outline-none
            focus:border-blue-500/50 transition-colors"
        />
        <button
          type="submit"
          disabled={loading || !inputTicker.trim()}
          className="px-6 py-3 rounded-xl bg-blue-500 text-white text-[13px] font-semibold
            hover:bg-blue-600 active:scale-95 transition-all
            disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
        >
          {loading ? (
            <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
            </svg>
          )}
          {loading ? "Buscando…" : "Buscar"}
        </button>
      </form>

      {loading && (
        <div className="text-center text-[12px] text-[var(--text-secondary)] animate-pulse">
          Buscando documentos na CVM e gerando resumos com IA…
        </div>
      )}

      {erro && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3 text-[13px] text-red-400">
          {erro}
        </div>
      )}

      {/* Resultado */}
      {resultado && (
        <div className="space-y-5">
          {/* Header do ativo */}
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <h2 className="text-lg font-bold text-[var(--text-primary)]">
                {resultado.ticker} — {resultado.empresa}
              </h2>
              <p className="text-[11px] text-[var(--text-secondary)]">
                {resultado.total} documentos encontrados
                {!resultado.ia_disponivel && " · IA indisponível"}
              </p>
            </div>
            {!resultado.ia_disponivel && (
              <span className="text-[10px] px-2.5 py-1 rounded-full border border-amber-500/30 bg-amber-500/5 text-amber-400">
                Sem resumos IA
              </span>
            )}
          </div>

          {/* Filtros de sentimento */}
          {resultado.ia_disponivel && resultado.total > 0 && (
            <div className="flex gap-2 flex-wrap">
              {[
                { id: "todos",    label: `Todos (${resultado.total})` },
                { id: "positivo", label: `Positivos (${countSent("positivo")})` },
                { id: "neutro",   label: `Neutros (${countSent("neutro")})` },
                { id: "negativo", label: `Negativos (${countSent("negativo")})` },
              ].map(f => (
                <button
                  key={f.id}
                  onClick={() => setFiltroSent(f.id)}
                  className={`text-[11px] px-3 py-1.5 rounded-full border transition-colors ${
                    filtroSent === f.id
                      ? "border-blue-500/50 bg-blue-500/10 text-blue-400"
                      : "border-[var(--border)] text-[var(--text-secondary)] hover:border-blue-500/30"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          )}

          {/* Lista de documentos */}
          {docsFiltrados.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[var(--border)] p-6 text-center text-[13px] text-[var(--text-secondary)]">
              Nenhum documento {filtroSent !== "todos" ? `com sentimento ${filtroSent}` : ""} encontrado.
            </div>
          ) : (
            <div className="space-y-2">
              {docsFiltrados.map(doc => (
                <DocCard key={doc.id_doc} doc={doc} />
              ))}
            </div>
          )}

          <p className="text-[10px] text-[var(--text-secondary)] opacity-50 text-center">
            {resultado.aviso}
          </p>
        </div>
      )}

      {/* Estado inicial */}
      {!resultado && !loading && !erro && (
        <div className="rounded-2xl border border-dashed border-[var(--border)] p-12 text-center">
          <p className="text-4xl mb-4">📄</p>
          <p className="text-[var(--text-primary)] font-semibold mb-1">Documentos CVM</p>
          <p className="text-[13px] text-[var(--text-secondary)]">
            Digite um ticker para buscar fatos relevantes, ITR, DFP e comunicados com resumo automático
          </p>
        </div>
      )}
    </div>
  );
}
