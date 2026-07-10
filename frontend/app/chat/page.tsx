"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import type { RSAnalisaData } from "@/types";
import { type MensagemChat, getRSAnalisa } from "@/lib/api";
import { IAChat } from "@/components/rs/IAChat";
import {
  type ConsultaSalva,
  getConsultas,
  salvarConsulta,
  deletarConsulta,
  gerarPDF,
} from "@/lib/chat-store";

// ── Modal de salvar consulta ─────────────────────────────────────────────────
function ModalSalvar({
  dadosTicker,
  onConfirmar,
  onCancelar,
}: {
  dadosTicker: RSAnalisaData;
  onConfirmar: (nome: string) => void;
  onCancelar: () => void;
}) {
  const nomeInicial = `${dadosTicker.ticker} — ${new Date().toLocaleDateString("pt-BR")}`;
  const [nome, setNome] = useState(nomeInicial);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.select();
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-6 shadow-2xl space-y-5">
        <div className="space-y-1">
          <h2 className="text-base font-bold text-[var(--text-primary)]">Salvar consulta</h2>
          <p className="text-[12px] text-[var(--text-secondary)]">
            Escolha um nome para identificar esta conversa nas Consultas Salvas.
          </p>
        </div>

        <input
          ref={inputRef}
          type="text"
          value={nome}
          onChange={e => setNome(e.target.value)}
          maxLength={80}
          className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)]
            px-4 py-2.5 text-[14px] text-[var(--text-primary)] outline-none
            focus:border-emerald-500/50 transition-colors"
          onKeyDown={e => { if (e.key === "Enter" && nome.trim()) onConfirmar(nome.trim()); }}
        />

        <div className="flex gap-2">
          <button
            onClick={onCancelar}
            className="flex-1 py-2.5 rounded-xl border border-[var(--border)] text-[13px]
              text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={() => { if (nome.trim()) onConfirmar(nome.trim()); }}
            disabled={!nome.trim()}
            className="flex-1 py-2.5 rounded-xl bg-emerald-500 text-white text-[13px] font-semibold
              hover:bg-emerald-600 active:scale-95 transition-all disabled:opacity-40"
          >
            Salvar
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Card de consulta salva ───────────────────────────────────────────────────
function ConsultaCard({
  consulta,
  onDeletar,
  onPDF,
  onVer,
}: {
  consulta: ConsultaSalva;
  onDeletar: () => void;
  onPDF: () => void;
  onVer: () => void;
}) {
  const data = new Date(consulta.timestamp).toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
  const trocas = consulta.mensagens.filter(m => m.papel === "usuario").length;
  const ultimaMsg = consulta.mensagens.filter(m => m.papel === "assistente").slice(-1)[0];

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4 space-y-3 hover:border-emerald-500/30 transition-colors">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[14px] font-semibold text-[var(--text-primary)] truncate">{consulta.nome}</p>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <span className="text-[11px] font-bold text-emerald-400">{consulta.ticker}</span>
            <span className="text-[10px] text-[var(--text-secondary)] truncate max-w-[180px]">{consulta.empresa}</span>
          </div>
        </div>
        <span className="text-[10px] text-[var(--text-secondary)] shrink-0 mt-0.5">{data}</span>
      </div>

      {ultimaMsg && (
        <p className="text-[12px] text-[var(--text-secondary)] line-clamp-2 leading-relaxed">
          {ultimaMsg.conteudo}
        </p>
      )}

      <div className="flex items-center gap-2">
        <span className="text-[10px] text-[var(--text-secondary)]">
          {trocas} {trocas === 1 ? "pergunta" : "perguntas"}
        </span>
        <div className="flex gap-1.5 ml-auto">
          <button
            onClick={onVer}
            className="text-[11px] px-3 py-1.5 rounded-lg border border-[var(--border)]
              text-[var(--text-secondary)] hover:text-emerald-400 hover:border-emerald-500/40 transition-colors"
          >
            Ver
          </button>
          <button
            onClick={onPDF}
            className="text-[11px] px-3 py-1.5 rounded-lg border border-[var(--border)]
              text-[var(--text-secondary)] hover:text-emerald-400 hover:border-emerald-500/40 transition-colors flex items-center gap-1"
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            PDF
          </button>
          <button
            onClick={onDeletar}
            className="text-[11px] px-2.5 py-1.5 rounded-lg border border-[var(--border)]
              text-[var(--text-secondary)] hover:text-red-400 hover:border-red-500/40 transition-colors"
            title="Excluir consulta"
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
              <path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/>
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Visualizador de consulta salva ───────────────────────────────────────────
function VisualizadorConsulta({
  consulta,
  onFechar,
}: {
  consulta: ConsultaSalva;
  onFechar: () => void;
}) {
  return (
    <div className="rounded-2xl border border-emerald-500/20 bg-[var(--bg-card)] flex flex-col overflow-hidden"
      style={{ minHeight: 440, maxHeight: 640 }}>
      <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--border)] shrink-0">
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-bold text-[var(--text-primary)] truncate">{consulta.nome}</p>
          <p className="text-[10px] text-[var(--text-secondary)]">
            {consulta.ticker} · {new Date(consulta.timestamp).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}
          </p>
        </div>
        <button
          onClick={() => gerarPDF(consulta)}
          className="text-[11px] px-3 py-1.5 rounded-lg border border-[var(--border)]
            text-[var(--text-secondary)] hover:text-emerald-400 hover:border-emerald-500/40 transition-colors flex items-center gap-1.5 shrink-0"
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
          Baixar PDF
        </button>
        <button
          onClick={onFechar}
          className="text-[11px] px-3 py-1.5 rounded-lg border border-[var(--border)]
            text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors shrink-0"
        >
          Fechar
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {consulta.mensagens.map((msg, i) => {
          const isUser = msg.papel === "usuario";
          return (
            <div key={i} className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
              {!isUser && (
                <div className="w-6 h-6 rounded-full bg-emerald-500/20 flex items-center justify-center shrink-0 mr-2 mt-0.5">
                  <span className="text-emerald-500 text-[9px] font-bold">IA</span>
                </div>
              )}
              <div
                className={`max-w-[80%] rounded-2xl px-4 py-3 text-[13px] leading-relaxed whitespace-pre-wrap ${
                  isUser
                    ? "bg-emerald-500/15 text-[var(--text-primary)] rounded-br-sm"
                    : "bg-[var(--bg-secondary)] border border-[var(--border)] text-[var(--text-primary)] rounded-bl-sm"
                }`}
              >
                {msg.conteudo}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Página principal ─────────────────────────────────────────────────────────
type Aba = "chat" | "salvas";

export default function ChatPage() {
  const [aba, setAba]                     = useState<Aba>("chat");
  const [inputTicker, setInputTicker]     = useState("");
  const [loading, setLoading]             = useState(false);
  const [dados, setDados]                 = useState<RSAnalisaData | null>(null);
  const [erro, setErro]                   = useState<string | null>(null);
  const [modalAberto, setModalAberto]     = useState(false);
  const [mensagensParaSalvar, setMensagensParaSalvar] = useState<MensagemChat[]>([]);
  const [consultas, setConsultas]         = useState<ConsultaSalva[]>([]);
  const [consultaVendo, setConsultaVendo] = useState<ConsultaSalva | null>(null);
  const [salvaSucesso, setSalvaSucesso]   = useState(false);

  // Carrega consultas do localStorage
  useEffect(() => {
    setConsultas(getConsultas());
  }, []);

  const buscar = useCallback(async (ticker: string) => {
    const t = ticker.trim().toUpperCase();
    if (!t) return;
    setLoading(true);
    setErro(null);
    setDados(null);
    try {
      const d = await getRSAnalisa(t);
      setDados(d);
    } catch {
      setErro(`Ticker "${t}" não encontrado.`);
    } finally {
      setLoading(false);
    }
  }, []);

  function abrirModalSalvar(mensagens: MensagemChat[]) {
    setMensagensParaSalvar(mensagens);
    setModalAberto(true);
  }

  function confirmarSalvar(nome: string) {
    if (!dados) return;
    salvarConsulta({
      nome,
      ticker:    dados.ticker,
      empresa:   dados.empresa,
      setor:     dados.setor ?? undefined,
      score:     dados.score?.score_total ?? undefined,
      mensagens: mensagensParaSalvar,
    });
    setConsultas(getConsultas());
    setModalAberto(false);
    setSalvaSucesso(true);
    setTimeout(() => setSalvaSucesso(false), 2500);
  }

  function handleDeletar(id: string) {
    deletarConsulta(id);
    setConsultas(getConsultas());
    if (consultaVendo?.id === id) setConsultaVendo(null);
  }

  const totalSalvas = consultas.length;

  return (
    <>
      {modalAberto && dados && (
        <ModalSalvar
          dadosTicker={dados}
          onConfirmar={confirmarSalvar}
          onCancelar={() => setModalAberto(false)}
        />
      )}

      <div className="max-w-2xl mx-auto px-4 py-8 space-y-5">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-emerald-500/15 flex items-center justify-center shrink-0">
            <span className="text-emerald-400 text-sm font-bold">IA</span>
          </div>
          <div>
            <h1 className="text-xl font-bold text-[var(--text-primary)]">Analista Particular</h1>
            <p className="text-[12px] text-[var(--text-secondary)]">
              Converse com a IA sobre qualquer ativo usando dados reais da plataforma
            </p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 p-1 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border)]">
          {(["chat", "salvas"] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setAba(tab)}
              className={`flex-1 py-2 rounded-lg text-[13px] font-semibold transition-all flex items-center justify-center gap-2 ${
                aba === tab
                  ? "bg-[var(--bg-card)] text-[var(--text-primary)] shadow-sm"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              }`}
            >
              {tab === "chat" ? (
                <>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                  </svg>
                  Novo Chat
                </>
              ) : (
                <>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
                    <polyline points="17 21 17 13 7 13 7 21"/>
                    <polyline points="7 3 7 8 15 8"/>
                  </svg>
                  Consultas Salvas
                  {totalSalvas > 0 && (
                    <span className="text-[10px] bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded-full font-bold">
                      {totalSalvas}
                    </span>
                  )}
                </>
              )}
            </button>
          ))}
        </div>

        {/* Toast de sucesso */}
        {salvaSucesso && (
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3
            text-[13px] text-emerald-400 flex items-center gap-2">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
            Consulta salva com sucesso! Veja em "Consultas Salvas".
          </div>
        )}

        {/* ── ABA CHAT ──────────────────────────────────────────────────────── */}
        {aba === "chat" && (
          <div className="space-y-5">
            {/* Busca de ticker */}
            {!dados && (
              <form
                onSubmit={e => { e.preventDefault(); void buscar(inputTicker); }}
                className="flex gap-2"
              >
                <input
                  type="text"
                  value={inputTicker}
                  onChange={e => setInputTicker(e.target.value.toUpperCase())}
                  placeholder="Digite um ticker (ex: PETR4, WEGE3, BBAS3…)"
                  maxLength={8}
                  autoFocus
                  className="flex-1 rounded-xl border border-[var(--border)] bg-[var(--bg-card)]
                    px-4 py-3 text-[14px] text-[var(--text-primary)] outline-none
                    focus:border-emerald-500/50 transition-colors"
                />
                <button
                  type="submit"
                  disabled={loading || !inputTicker.trim()}
                  className="px-6 py-3 rounded-xl bg-emerald-500 text-white text-[13px] font-semibold
                    hover:bg-emerald-600 active:scale-95 transition-all
                    disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {loading ? (
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
                    </svg>
                  )}
                  {loading ? "Carregando…" : "Analisar"}
                </button>
              </form>
            )}

            {erro && (
              <div className="rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3 text-[13px] text-red-400">
                {erro}
              </div>
            )}

            {/* Info do ativo + botão trocar */}
            {dados && (
              <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)]">
                <div className="min-w-0">
                  <p className="text-[13px] font-bold text-[var(--text-primary)] truncate">
                    {dados.ticker} — {dados.empresa}
                  </p>
                  <p className="text-[11px] text-[var(--text-secondary)]">
                    RS Score {dados.score?.score_total ?? "N/D"}/1000 · {dados.setor ?? ""}
                  </p>
                </div>
                <button
                  onClick={() => { setDados(null); setInputTicker(""); }}
                  className="shrink-0 text-[11px] px-3 py-1.5 rounded-lg border border-[var(--border)]
                    text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-emerald-500/40
                    transition-colors"
                >
                  Trocar ativo
                </button>
              </div>
            )}

            {/* Chat */}
            {dados && <IAChat dados={dados} empresa={dados.empresa} onSave={abrirModalSalvar} />}

            {/* Estado inicial */}
            {!dados && !loading && !erro && (
              <div className="rounded-2xl border border-dashed border-[var(--border)] p-12 text-center space-y-3">
                <p className="text-4xl">💬</p>
                <p className="text-[var(--text-primary)] font-semibold">Analista Particular</p>
                <p className="text-[13px] text-[var(--text-secondary)]">
                  Pesquise um ativo acima e pergunte tudo sobre fundamentos, valuation e dividendos
                </p>
                <div className="flex flex-wrap justify-center gap-2 pt-2">
                  {["PETR4", "WEGE3", "BBAS3", "ITUB4", "VALE3"].map(t => (
                    <button
                      key={t}
                      onClick={() => { setInputTicker(t); void buscar(t); }}
                      className="text-[11px] px-3 py-1.5 rounded-full border border-[var(--border)]
                        text-[var(--text-secondary)] hover:text-emerald-400 hover:border-emerald-500/40
                        transition-colors"
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── ABA CONSULTAS SALVAS ──────────────────────────────────────────── */}
        {aba === "salvas" && (
          <div className="space-y-4">
            {consultaVendo ? (
              <VisualizadorConsulta
                consulta={consultaVendo}
                onFechar={() => setConsultaVendo(null)}
              />
            ) : consultas.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-[var(--border)] p-12 text-center space-y-3">
                <p className="text-4xl">📂</p>
                <p className="text-[var(--text-primary)] font-semibold">Nenhuma consulta salva</p>
                <p className="text-[13px] text-[var(--text-secondary)]">
                  Faça uma conversa na aba "Novo Chat" e clique em{" "}
                  <strong className="text-[var(--text-primary)]">Salvar</strong> para guardar aqui.
                </p>
                <button
                  onClick={() => setAba("chat")}
                  className="mt-2 text-[12px] px-4 py-2 rounded-xl bg-emerald-500 text-white
                    hover:bg-emerald-600 active:scale-95 transition-all"
                >
                  Ir para o Chat
                </button>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <p className="text-[13px] text-[var(--text-secondary)]">
                    {consultas.length} {consultas.length === 1 ? "consulta salva" : "consultas salvas"}
                  </p>
                </div>
                <div className="space-y-3">
                  {consultas.map(c => (
                    <ConsultaCard
                      key={c.id}
                      consulta={c}
                      onDeletar={() => handleDeletar(c.id)}
                      onPDF={() => gerarPDF(c)}
                      onVer={() => setConsultaVendo(c)}
                    />
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </>
  );
}
