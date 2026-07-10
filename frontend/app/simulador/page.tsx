"use client";

import { useState } from "react";
import { postSimulador } from "@/lib/api";
import type { SimuladorData } from "@/types";
import { ResumoCard } from "@/components/simulador/ResumoCard";
import { GraficosSimulador } from "@/components/simulador/GraficosSimulador";
import { TimelineTable } from "@/components/simulador/TimelineTable";

const SUGESTOES = ["PETR4", "VALE3", "ITUB4", "WEGE3", "BBDC4", "RENT3", "MGLU3", "ABEV3", "SUZB3", "RADL3"];
const hoje = new Date().toISOString().split("T")[0];
const cincoAnosAtras = new Date(Date.now() - 5 * 365.25 * 24 * 3600 * 1000).toISOString().split("T")[0];

export default function SimuladorPage() {
  const [ticker, setTicker]     = useState("");
  const [dataCompra, setDataCompra] = useState(cincoAnosAtras);
  const [dataVenda, setDataVenda]   = useState("");
  const [quantidade, setQtd]    = useState("100");
  const [corretagem, setCorr]   = useState("0");
  const [dividendos, setDiv]    = useState("0");
  const [jcp, setJcp]           = useState("0");

  const [dados, setDados]  = useState<SimuladorData | null>(null);
  const [loading, setLoad] = useState(false);
  const [erro, setErro]    = useState<string | null>(null);

  async function simular() {
    if (!ticker || !dataCompra || !quantidade) {
      setErro("Preencha o ticker, a data de compra e a quantidade.");
      return;
    }
    setLoad(true);
    setErro(null);
    setDados(null);
    try {
      const res = await postSimulador({
        ticker,
        data_compra: dataCompra,
        data_venda:  dataVenda || undefined,
        quantidade:  parseFloat(quantidade),
        corretagem:  parseFloat(corretagem) || 0,
        dividendos_recebidos: parseFloat(dividendos) || 0,
        jcp_recebido: parseFloat(jcp) || 0,
      });
      setDados(res);
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : "Erro ao simular.");
    } finally {
      setLoad(false);
    }
  }

  return (
    <main className="min-h-screen bg-[var(--bg-primary)] pb-20">
      <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">

        {/* Título */}
        <div>
          <h1 className="text-2xl font-bold">Simulador de Investimentos</h1>
          <p className="text-sm text-[var(--text-secondary)] mt-1">
            Informe o ativo, o período e a quantidade. O preço de compra e de venda são buscados
            automaticamente do histórico real da B3.
          </p>
        </div>

        {/* Formulário */}
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
          <h2 className="text-sm font-semibold text-[var(--text-secondary)] mb-4 uppercase tracking-wide">
            Dados da Operação
          </h2>

          {/* Sugestões rápidas */}
          <div className="mb-4">
            <p className="text-[11px] text-[var(--text-secondary)] mb-2">Ações populares:</p>
            <div className="flex flex-wrap gap-1.5">
              {SUGESTOES.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setTicker(s)}
                  className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border transition-colors ${
                    ticker === s
                      ? "border-violet-500 bg-violet-500/10 text-violet-400"
                      : "border-[var(--border)] text-[var(--text-secondary)] hover:border-violet-500/40"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Ticker */}
            <div>
              <label className="block text-[11px] text-[var(--text-secondary)] mb-1 uppercase tracking-wide">
                Ticker *
              </label>
              <input
                type="text"
                value={ticker}
                onChange={(e) => setTicker(e.target.value.toUpperCase())}
                placeholder="Ex: PETR4"
                className="w-full rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 text-sm font-mono uppercase focus:outline-none focus:border-violet-500 transition-colors"
              />
            </div>

            {/* Data de compra */}
            <div>
              <label className="block text-[11px] text-[var(--text-secondary)] mb-1 uppercase tracking-wide">
                Data de Compra *
              </label>
              <input
                type="date"
                value={dataCompra}
                max={hoje}
                onChange={(e) => setDataCompra(e.target.value)}
                className="w-full rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 text-sm focus:outline-none focus:border-violet-500 transition-colors"
              />
              <p className="text-[10px] text-[var(--text-secondary)] opacity-50 mt-1">
                Preço buscado automaticamente do histórico
              </p>
            </div>

            {/* Data de venda */}
            <div>
              <label className="block text-[11px] text-[var(--text-secondary)] mb-1 uppercase tracking-wide">
                Data de Venda
                <span className="opacity-60 ml-1 normal-case">(vazio = posição aberta)</span>
              </label>
              <input
                type="date"
                value={dataVenda}
                max={hoje}
                min={dataCompra}
                onChange={(e) => setDataVenda(e.target.value)}
                className="w-full rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 text-sm focus:outline-none focus:border-violet-500 transition-colors"
              />
              <p className="text-[10px] text-[var(--text-secondary)] opacity-50 mt-1">
                Preço buscado automaticamente do histórico
              </p>
            </div>

            {/* Quantidade */}
            <div>
              <label className="block text-[11px] text-[var(--text-secondary)] mb-1 uppercase tracking-wide">
                Quantidade de Ações *
              </label>
              <input
                type="number"
                value={quantidade}
                min="1"
                step="1"
                onChange={(e) => setQtd(e.target.value)}
                className="w-full rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 text-sm font-mono focus:outline-none focus:border-violet-500 transition-colors"
              />
            </div>

            {/* Corretagem */}
            <div>
              <label className="block text-[11px] text-[var(--text-secondary)] mb-1 uppercase tracking-wide">
                Corretagem Total (R$)
              </label>
              <input
                type="number"
                value={corretagem}
                min="0"
                step="0.01"
                onChange={(e) => setCorr(e.target.value)}
                className="w-full rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 text-sm font-mono focus:outline-none focus:border-violet-500 transition-colors"
              />
            </div>

            {/* Dividendos */}
            <div>
              <label className="block text-[11px] text-[var(--text-secondary)] mb-1 uppercase tracking-wide">
                Dividendos Recebidos (R$)
                <span className="opacity-60 ml-1 normal-case">total no período</span>
              </label>
              <input
                type="number"
                value={dividendos}
                min="0"
                step="0.01"
                onChange={(e) => setDiv(e.target.value)}
                className="w-full rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 text-sm font-mono focus:outline-none focus:border-violet-500 transition-colors"
              />
            </div>

            {/* JCP */}
            <div>
              <label className="block text-[11px] text-[var(--text-secondary)] mb-1 uppercase tracking-wide">
                JCP Líquido (R$)
                <span className="opacity-60 ml-1 normal-case">já descontado 15% IR</span>
              </label>
              <input
                type="number"
                value={jcp}
                min="0"
                step="0.01"
                onChange={(e) => setJcp(e.target.value)}
                className="w-full rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 text-sm font-mono focus:outline-none focus:border-violet-500 transition-colors"
              />
            </div>
          </div>

          {/* Ações */}
          <div className="mt-5 flex flex-wrap gap-3 items-center">
            <button
              type="button"
              onClick={simular}
              disabled={loading}
              className="px-6 py-2.5 rounded-xl bg-violet-600 text-white font-semibold text-sm hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? "Calculando..." : "Simular Investimento"}
            </button>
            {dados && (
              <button
                type="button"
                onClick={() => { setDados(null); setErro(null); }}
                className="px-4 py-2.5 rounded-xl border border-[var(--border)] text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
              >
                Nova simulação
              </button>
            )}
          </div>

          <p className="text-[10px] text-[var(--text-secondary)] opacity-40 mt-3">
            Histórico mensal via Brapi (até 5 anos). Dividendos e JCP devem ser informados
            manualmente — informe o valor total recebido no período. IR é estimativa (15% swing
            trade) — consulte seu contador para fins fiscais.
          </p>
        </div>

        {/* Erro */}
        {erro && (
          <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4">
            <p className="text-sm text-red-400">{erro}</p>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-10 text-center">
            <div className="inline-block w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin mb-3" />
            <p className="text-sm text-[var(--text-secondary)]">
              Buscando histórico de <span className="font-mono font-semibold">{ticker}</span> e
              calculando resultados...
            </p>
          </div>
        )}

        {/* Resultados */}
        {dados && !loading && (
          <div className="space-y-5">
            {/* Aviso de dados */}
            {dados.aviso && (
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 flex gap-2">
                <span className="text-amber-500 shrink-0 font-bold">!</span>
                <p className="text-[12px] text-amber-500">{dados.aviso}</p>
              </div>
            )}

            {/* Cabeçalho do resultado */}
            <div className="flex items-start gap-3">
              <div className="flex-1">
                <h2 className="text-lg font-bold">
                  {dados.resumo.ticker}
                  <span className="text-[var(--text-secondary)] font-normal ml-2 text-base">
                    {dados.resumo.empresa}
                  </span>
                </h2>
                <p className="text-[12px] text-[var(--text-secondary)] mt-0.5">
                  Compra em{" "}
                  <span className="font-semibold text-[var(--text-primary)]">
                    {fmt(dados.resumo.preco_compra_data_usada)}
                  </span>
                  {" → "}
                  {dados.resumo.posicao_aberta
                    ? <span className="text-emerald-500 font-semibold">Posição aberta (hoje)</span>
                    : <span className="font-semibold text-[var(--text-primary)]">
                        Venda em {fmt(dados.resumo.preco_saida_data_usada)}
                      </span>
                  }
                  {" · "}
                  {dados.resumo.periodo_dias} dias · {dados.resumo.periodo_anos.toFixed(1)} anos
                </p>
              </div>
              {dados.resumo.posicao_aberta && (
                <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 shrink-0">
                  Em carteira
                </span>
              )}
            </div>

            {/* Etapa 1 — Resumo da operação */}
            <ResumoCard resumo={dados.resumo} />

            {/* Etapa 3 — Gráficos */}
            {dados.serie_patrimonio.length > 1 && (
              <GraficosSimulador dados={dados} />
            )}

            {/* Etapa 2 — Linha do tempo */}
            {dados.timeline.length > 0 && (
              <TimelineTable
                timeline={dados.timeline}
                precoCompra={dados.resumo.preco_compra}
              />
            )}

            <p className="text-[10px] text-[var(--text-secondary)] opacity-40 text-center pt-2">
              Simulação baseada em dados históricos reais da B3 via Brapi. Apenas para fins
              educacionais. Não constitui recomendação de investimento.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}

function fmt(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("pt-BR");
}
