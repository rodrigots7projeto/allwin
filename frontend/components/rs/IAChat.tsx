"use client";

import { useState, useRef, useEffect, type FormEvent, type KeyboardEvent } from "react";
import type { RSAnalisaData } from "@/types";
import { type MensagemChat, streamIAChat } from "@/lib/api";

const CHIPS = [
  "O ativo está barato ou caro?",
  "Qual é o maior risco desta empresa?",
  "Como está a saúde financeira?",
  "Vale a pena pelos dividendos?",
  "O endividamento preocupa?",
  "Comparado ao setor, como está?",
];

interface Props {
  dados:    RSAnalisaData;
  empresa:  string;
  onSave?:  (mensagens: MensagemChat[]) => void;
}

export function IAChat({ dados, empresa, onSave }: Props) {
  const [mensagens, setMensagens] = useState<MensagemChat[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [staticFallback, setStaticFallback] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [mensagens]);

  async function enviar(texto: string) {
    const trimmed = texto.trim();
    if (!trimmed || streaming) return;
    setErro(null);

    const historico: MensagemChat[] = [
      ...mensagens,
      { papel: "usuario", conteudo: trimmed },
    ];
    setMensagens(historico);
    setInput("");
    setStreaming(true);

    // placeholder do assistente
    setMensagens(prev => [...prev, { papel: "assistente", conteudo: "" }]);

    try {
      for await (const token of streamIAChat(dados.ticker, historico, dados)) {
        setMensagens(prev => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last?.papel === "assistente") {
            updated[updated.length - 1] = { ...last, conteudo: last.conteudo + token };
          }
          return updated;
        });
      }
    } catch (e: unknown) {
      const err = e as { isStaticFallback?: boolean; message?: string };
      if (err.isStaticFallback) {
        setStaticFallback(true);
        setMensagens(prev => prev.slice(0, -1));
      } else {
        setErro(err.message ?? "Erro ao conectar com o Analista");
        setMensagens(prev => prev.slice(0, -1));
      }
    } finally {
      setStreaming(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    void enviar(input);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void enviar(input);
    }
  }

  if (staticFallback) {
    return (
      <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-6 text-center space-y-2">
        <p className="text-amber-500 font-bold text-sm">Chat temporariamente indisponível</p>
        <p className="text-[12px] text-[var(--text-secondary)]">
          O Analista Particular requer uma chave de API configurada no servidor.
          Use a aba de Análise estática enquanto isso.
        </p>
      </div>
    );
  }

  const semMensagens = mensagens.length === 0;

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] flex flex-col overflow-hidden"
      style={{ minHeight: 440, maxHeight: 640 }}>

      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--border)] shrink-0">
        <div className="w-6 h-6 rounded-full bg-emerald-500/20 flex items-center justify-center shrink-0">
          <span className="text-emerald-500 text-[10px] font-bold">IA</span>
        </div>
        <div className="min-w-0">
          <p className="text-sm font-bold leading-tight">Analista Particular</p>
          <p className="text-[10px] text-[var(--text-secondary)] truncate">
            Pergunte sobre {empresa} ({dados.ticker}) — dados internos da plataforma
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2 shrink-0">
          {streaming && (
            <span className="text-[10px] text-emerald-400 animate-pulse">analisando…</span>
          )}
          {onSave && mensagens.length > 0 && !streaming && (
            <button
              type="button"
              onClick={() => onSave(mensagens)}
              title="Salvar consulta"
              className="flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-lg border
                border-[var(--border)] text-[var(--text-secondary)] hover:text-emerald-400
                hover:border-emerald-500/40 transition-colors"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
                <polyline points="17 21 17 13 7 13 7 21"/>
                <polyline points="7 3 7 8 15 8"/>
              </svg>
              Salvar
            </button>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {/* Estado inicial com chips */}
        {semMensagens && (
          <div className="space-y-4">
            <p className="text-[12px] text-[var(--text-secondary)] text-center">
              Faça qualquer pergunta sobre {empresa}. Respondo apenas com base nos dados da plataforma.
            </p>
            <div className="flex flex-wrap gap-2">
              {CHIPS.map(chip => (
                <button
                  key={chip}
                  onClick={() => void enviar(chip)}
                  disabled={streaming}
                  className="text-[11px] px-3 py-1.5 rounded-full border border-[var(--border)]
                    bg-[var(--bg-secondary)] text-[var(--text-secondary)]
                    hover:border-emerald-500/50 hover:text-emerald-500 hover:bg-emerald-500/5
                    transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {chip}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Mensagens */}
        {mensagens.map((msg, i) => {
          const isUser = msg.papel === "usuario";
          const isStreaming = !isUser && i === mensagens.length - 1 && streaming;
          return (
            <div key={i} className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
              {!isUser && (
                <div className="w-6 h-6 rounded-full bg-emerald-500/20 flex items-center justify-center shrink-0 mr-2 mt-0.5">
                  <span className="text-emerald-500 text-[9px] font-bold">IA</span>
                </div>
              )}
              <div
                className={`max-w-[80%] rounded-2xl px-4 py-3 text-[13px] leading-relaxed ${
                  isUser
                    ? "bg-emerald-500/15 text-[var(--text-primary)] rounded-br-sm"
                    : "bg-[var(--bg-secondary)] border border-[var(--border)] text-[var(--text-primary)] rounded-bl-sm"
                }`}
              >
                {msg.conteudo}
                {isStreaming && !msg.conteudo && (
                  <span className="inline-block w-2 h-4 bg-emerald-500 rounded-sm animate-pulse ml-0.5 align-middle" />
                )}
                {isStreaming && msg.conteudo && (
                  <span className="inline-block w-1.5 h-3.5 bg-emerald-500 rounded-sm animate-pulse ml-0.5 align-middle" />
                )}
              </div>
            </div>
          );
        })}

        {/* Erro */}
        {erro && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3 text-[12px] text-red-400">
            {erro}
          </div>
        )}

        {/* Chips pós-resposta */}
        {!semMensagens && !streaming && !erro && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {CHIPS.filter(c => !mensagens.some(m => m.papel === "usuario" && m.conteudo === c))
              .slice(0, 3)
              .map(chip => (
                <button
                  key={chip}
                  onClick={() => void enviar(chip)}
                  className="text-[10px] px-2.5 py-1 rounded-full border border-[var(--border)]
                    text-[var(--text-secondary)] hover:text-emerald-500 hover:border-emerald-500/40
                    transition-colors"
                >
                  {chip}
                </button>
              ))}
          </div>
        )}

        <div ref={scrollRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit}
        className="border-t border-[var(--border)] px-3 py-2.5 flex gap-2 items-end shrink-0">
        <textarea
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Pergunte sobre os fundamentos, valuation, dividendos…"
          rows={1}
          maxLength={1000}
          disabled={streaming}
          className="flex-1 resize-none bg-transparent text-[13px] text-[var(--text-primary)]
            placeholder:text-[var(--text-secondary)]/60 outline-none py-1.5
            disabled:opacity-50"
          style={{ maxHeight: 80, overflowY: "auto" }}
        />
        <button
          type="submit"
          disabled={streaming || !input.trim()}
          className="w-8 h-8 rounded-xl bg-emerald-500 text-white flex items-center justify-center
            hover:bg-emerald-600 active:scale-95 transition-all
            disabled:opacity-30 disabled:cursor-not-allowed disabled:scale-100 shrink-0"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M22 2 11 13M22 2 15 22l-4-9-9-4 20-7z" />
          </svg>
        </button>
      </form>

      {/* Disclaimer */}
      <p className="text-[9px] text-[var(--text-secondary)] opacity-50 text-center pb-2 px-4 shrink-0">
        Respostas geradas por IA com base nos dados da plataforma. Não constitui recomendação de investimento.
      </p>
    </div>
  );
}
