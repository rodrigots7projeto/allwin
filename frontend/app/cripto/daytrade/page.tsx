"use client";

import { useState, useEffect, useCallback, useRef } from "react";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1";

const COIN_ICONS: Record<string, string> = {
  BTC: "₿", ETH: "Ξ", SOL: "◎", BNB: "⬡", XRP: "✕", DOGE: "Ð",
  ADA: "₳", AVAX: "🔺", LINK: "⬡", LTC: "Ł", DOT: "●", MATIC: "◆",
  BCH: "₿", UNI: "🦄", AAVE: "👻", NEAR: "Ⓝ", ARB: "🔵", OP: "🔴", SUI: "💧",
};

// ── Types ──────────────────────────────────────────────────────────────────────

interface TFResult {
  tf: string;
  valido: boolean;
  preco?: number;
  score?: number;
  bullish?: boolean;
  tendencia?: { tipo: string; forca: string; direcao: string; confianca: number };
  indicadores?: {
    ema9?: number; ema21?: number; ema50?: number; ema100?: number; ema200?: number;
    rsi?: number;
    macd?: { macd: number; signal: number; histograma: number; sinal: string };
    bollinger?: { upper: number; middle: number; lower: number; sinal: string };
    atr?: number; atr_pct?: number;
    adx?: { adx?: number; plus_di: number; minus_di: number; sinal: string; direcao: string };
    stoch?: { k: number; d: number; overbought: boolean; oversold: boolean; bull_cross: boolean };
    cci?: number; mfi?: number; roc?: number; williams_r?: number;
    vwap?: number; supertrend?: { bullish: boolean };
  };
  compradores?: { buy_pct: number; sell_pct: number; delta: number; dominant: string };
  padroes?: Array<{ nome: string }>;
  volume?: { atual: number; media_20: number; ratio: number };
  fibonacci?: { baixo: number; alto: number; niveis: Record<string, number> };
}

interface Niveis {
  tipo: string; entrada: number; stop: number; stop_pct: number;
  alvo1: number; alvo1_pct: number; rr1: number;
  alvo2: number; alvo2_pct: number; rr2: number;
  alvo3: number; alvo3_pct: number; rr3: number;
  atr: number; atr_pct: number; suporte: number; resistencia: number;
}

interface DaytradeData {
  simbolo: string; preco_atual: number; score: number; cor: string;
  decisao: string; estrelas: number; operar: boolean; bullish: boolean;
  consenso: { score: number; direcao: string; desc: string; bull_pct: number; tfs_validos: number; tfs_bullish: number };
  niveis: Niveis;
  compradores: { buy_pct: number; sell_pct: number; delta: number; dominant: string };
  timeframes: Record<string, TFResult>;
  justificativa: string;
  var24h?: number; volume24h?: number; high24h?: number; low24h?: number;
  fear_greed?: number;
  usd_brl?: number;
}

interface ScanItem {
  simbolo: string; preco: number; score: number; cor: string;
  decisao: string; estrelas: number; operar: boolean; bullish: boolean;
  var24h?: number; volume24h?: number; buy_pct: number; dominant: string;
  rsi?: number; atr_pct?: number; rr1?: number; tendencia?: string; bull_pct: number;
  padroes?: string[]; usd_brl?: number;
}

interface ScanData {
  geral: ScanItem[]; top_compras: ScanItem[]; top_vendas: ScanItem[];
  top_prob: ScanItem[]; top_rr: ScanItem[]; top_volume: ScanItem[];
  top_momentum: ScanItem[]; total: number; usd_brl?: number;
}


// ── Simulation Wallet ────────────────────────────────────────────────────────

const WALLET_KEY       = "allwin_dt_wallet_v1";
const MULTI_WALLET_KEY = "allwin_dt_wallets_v2";
const TRADE_SIZE = 1000;
const FEE_RATE   = 0.0006;

interface SimPos {
  simbolo: string; units: number; amount_brl: number;
  price_usd: number; price_brl: number;
  last_price_usd: number; last_usd_brl: number;
  time: number; score_entry: number;
  stop_loss_price?: number;
  take_profit_price?: number;
  sl_pct?: number;
  tp_pct?: number;
}

interface SimTrade {
  id: string; simbolo: string; tipo: "C" | "V";
  price_brl: number; amount_brl: number;
  fee?: number;
  pnl_brl?: number; pct?: number;
  time: number; score: number; auto: boolean;
  motivo_entrada?: string;
  motivo_saida?: string;
  stop_loss?: number;
  take_profit?: number;
  sl_pct?: number;
  tp_pct?: number;
}

interface SimWallet {
  saldo_inicial: number; saldo_livre: number;
  positions: Record<string, SimPos>;
  trades: SimTrade[];
  criado: string;
}

// ── Perfis Operacionais ──────────────────────────────────────────────────────

interface PerfilConfig {
  id: string;
  nome: string;
  nivel: "Normal" | "PRO" | "PRO MAX" | "Alavancado";
  perfil: "Conservador" | "Moderado" | "Agressivo";
  emoji: string;
  cor: string;
  score_compra: number;
  score_venda: number;
  bull_pct_min: number;
  max_posicoes: number;
  sl_pct: number;
  tp_pct: number;
  aguardar_ok: boolean;
  apenas_aguardar?: boolean;  // TRUE = só entra em AGUARDAR (nunca em COMPRAR)
  score_max_compra?: number;  // score máximo para entrar (perfis Subida: ≤79)
  capital_inicial?: number;   // padrão 10000; alavancados = 50000
  stake_base?: number;        // padrão TRADE_SIZE=1000; alavancados = 5000
  stake_dupla_score?: number; // score mínimo para dobrar a stake
  descricao: string;
  caracteristicas: string[];
  pontos_fortes: string[];
  pontos_fracos: string[];
}

const PERFIS: PerfilConfig[] = [
  {
    id: "cons_normal", nome: "Conservador", nivel: "Normal", perfil: "Conservador", emoji: "🛡️", cor: "#3b82f6",
    score_compra: 65, score_venda: 40, bull_pct_min: 55, max_posicoes: 3, sl_pct: 0.015, tp_pct: 0.05, aguardar_ok: false,
    descricao: "Opera apenas em cenarios de altissima probabilidade. Aguarda confirmacao completa de multiplos indicadores antes de entrar. Ideal para preservacao de capital.",
    caracteristicas: [
      "Score minimo 75 — so os sinais mais fortes",
      "Dominancia de compradores acima de 60%",
      "Maximo 3 posicoes simultaneas",
      "Stop Loss apertado de 1,5% para cortar perdas rapido",
      "Take Profit conservador de 3% por operacao",
      "Exige status COMPRAR — nao opera em AGUARDAR",
      "Nao opera em mercados lateralizados ou volateis",
    ],
    pontos_fortes: ["Altissima precisao nas entradas", "Drawdown minimo", "Ideal para iniciantes", "Preserva capital em dias ruins"],
    pontos_fracos: ["Poucas operacoes por dia", "Pode perder movimentos rapidos", "TP pequeno limita o ganho"],
  },
  {
    id: "cons_pro", nome: "Conservador", nivel: "PRO", perfil: "Conservador", emoji: "🛡️", cor: "#2563eb",
    score_compra: 63, score_venda: 38, bull_pct_min: 53, max_posicoes: 4, sl_pct: 0.02, tp_pct: 0.07, aguardar_ok: false,
    descricao: "Versao aprimorada do conservador. Abre mais posicoes mantendo criterios rigidos de qualidade. Equilibrio entre seguranca e volume de operacoes.",
    caracteristicas: [
      "Score minimo 72 — sinais de alta qualidade",
      "Dominancia de compradores acima de 57%",
      "Maximo 4 posicoes simultaneas",
      "Stop Loss de 2% com espaco para respirar",
      "Take Profit de 5% — melhor relacao risco/retorno",
      "Exige status COMPRAR — nao opera em AGUARDAR",
      "Opera tendencias estabelecidas com pullbacks",
    ],
    pontos_fortes: ["Bom equilibrio entre seguranca e operacoes", "RR 1:2,5 por operacao", "Mais diversificacao que o Normal"],
    pontos_fracos: ["Score alto ainda filtra muitas oportunidades", "Stop pode ser apertado em criptos volateis"],
  },
  {
    id: "cons_promax", nome: "Conservador", nivel: "PRO MAX", perfil: "Conservador", emoji: "🛡️", cor: "#1d4ed8",
    score_compra: 62, score_venda: 37, bull_pct_min: 52, max_posicoes: 5, sl_pct: 0.025, tp_pct: 0.09, aguardar_ok: false,
    descricao: "Maximo desempenho dentro do perfil conservador. Aumenta posicoes e alvos mantendo rigor tecnico. Para traders conservadores que buscam maximizar resultados.",
    caracteristicas: [
      "Score minimo 68 — amplia o leque de ativos",
      "Dominancia de compradores acima de 54%",
      "Maximo 5 posicoes — maior diversificacao",
      "Stop Loss de 2,5% — balanceado",
      "Take Profit de 7% — alvo expressivo",
      "Exige status COMPRAR — nao opera em AGUARDAR",
      "Aceita consolidacoes com potencial de rompimento",
    ],
    pontos_fortes: ["Maior diversificacao que Normal e PRO", "TP de 7% por operacao", "Boa relacao risco/retorno 1:2,8"],
    pontos_fracos: ["Stop de 2,5% pode ser atingido em criptos volateis", "Mais trades = mais exposicao ao mercado"],
  },
  {
    id: "mod_normal", nome: "Moderado", nivel: "Normal", perfil: "Moderado", emoji: "⚖️", cor: "#8b5cf6",
    score_compra: 62, score_venda: 37, bull_pct_min: 50, max_posicoes: 4, sl_pct: 0.03, tp_pct: 0.10, aguardar_ok: false,
    descricao: "Perfil equilibrado entre risco e retorno. Aceita mais volatilidade em troca de mais oportunidades. Ideal para traders com experiencia moderada.",
    caracteristicas: [
      "Score minimo 65 — boas oportunidades de entrada",
      "Dominancia acima de 52% — leve vantagem dos compradores",
      "Maximo 4 posicoes simultaneas",
      "Stop Loss de 3% — espaco para oscilacao normal",
      "Take Profit de 8% — relacao risco/retorno 1:2,7",
      "Exige status COMPRAR — nao opera em AGUARDAR",
      "Aproveita pullbacks em tendencias de alta",
    ],
    pontos_fortes: ["Bom volume de operacoes por dia", "RR 1:2,7 por operacao", "Equilibrio ideal para a maioria dos traders"],
    pontos_fracos: ["Mais drawdown que perfil conservador", "Exige acompanhamento das posicoes abertas"],
  },
  {
    id: "mod_pro", nome: "Moderado", nivel: "PRO", perfil: "Moderado", emoji: "⚖️", cor: "#7c3aed",
    score_compra: 55, score_venda: 35, bull_pct_min: 48, max_posicoes: 5, sl_pct: 0.04, tp_pct: 0.12, aguardar_ok: true,
    descricao: "Versao evoluida do moderado. Aceita sinais ligeiramente mais fracos e compra mesmo em AGUARDAR quando o score e bull_pct sao favoraveis. Maior potencial de retorno.",
    caracteristicas: [
      "Score minimo 62 — captura mais oportunidades",
      "Dominancia acima de 50% — mercado equilibrado",
      "Maximo 5 posicoes — diversificacao ampla",
      "Stop Loss de 4% — tolerancia a volatilidade",
      "Take Profit de 12% — alvo agressivo para um moderado",
      "Compra em AGUARDAR se score e bull_pct forem favoraveis",
      "Opera breakouts, pullbacks e consolidacoes de qualidade",
    ],
    pontos_fortes: ["Alto potencial de retorno (12% por trade)", "5 posicoes simultaneas", "Captura breakouts precocemente"],
    pontos_fracos: ["Stop maior amplia risco por operacao", "Maior numero de stops acionados que o Normal"],
  },
  {
    id: "mod_promax", nome: "Moderado", nivel: "PRO MAX", perfil: "Moderado", emoji: "⚖️", cor: "#6d28d9",
    score_compra: 52, score_venda: 33, bull_pct_min: 47, max_posicoes: 6, sl_pct: 0.05, tp_pct: 0.15, aguardar_ok: true,
    descricao: "Configuracao maxima do perfil moderado. Compra em AGUARDAR sempre que o mercado apresentar condicoes favoraveis. Alta diversificacao com alvos ambiciosos.",
    caracteristicas: [
      "Score minimo 60 — amplo leque de ativos",
      "Dominancia acima de 50%",
      "Maximo 6 posicoes — maxima diversificacao moderada",
      "Stop Loss de 5% — absorve oscilacoes significativas",
      "Take Profit de 15% — alvo muito expressivo",
      "Compra em AGUARDAR se score e bull_pct forem favoraveis",
      "Opera rompimentos, pullbacks e reversoes tecnicas",
    ],
    pontos_fortes: ["TP de 15% por operacao", "6 posicoes simultaneas", "Alta diversificacao de ativos"],
    pontos_fracos: ["Stop de 5% pode impactar capital em sequencia de perdas", "Necessita monitoramento ativo"],
  },
  {
    id: "agr_normal", nome: "Agressivo", nivel: "Normal", perfil: "Agressivo", emoji: "⚡", cor: "#f59e0b",
    score_compra: 50, score_venda: 32, bull_pct_min: 46, max_posicoes: 5, sl_pct: 0.05, tp_pct: 0.15, aguardar_ok: true,
    descricao: "Alta tolerancia ao risco. Compra em AGUARDAR e em COMPRAR, entrando cedo para capturar todo o movimento. Prioriza volume de operacoes sobre precisao.",
    caracteristicas: [
      "Score minimo 58 — entra no inicio do movimento",
      "Dominancia acima de 48% — qualquer inclinacao positiva",
      "Maximo 5 posicoes simultaneas",
      "Stop Loss de 5% — tolerancia alta a volatilidade",
      "Take Profit de 15% — busca movimentos grandes",
      "Compra em AGUARDAR — nao espera confirmacao plena",
      "Aproveita momentum e volume explosivo antes da massa",
    ],
    pontos_fortes: ["Captura movimentos desde o inicio", "Alto potencial de ganho em dias de tendencia", "Muitas oportunidades por dia"],
    pontos_fracos: ["Taxa de stop loss maior que perfis conservadores", "Requer banca solida para absorver sequencia de stops"],
  },
  {
    id: "agr_pro", nome: "Agressivo", nivel: "PRO", perfil: "Agressivo", emoji: "⚡", cor: "#d97706",
    score_compra: 48, score_venda: 30, bull_pct_min: 44, max_posicoes: 6, sl_pct: 0.07, tp_pct: 0.20, aguardar_ok: true,
    descricao: "Opera na vanguarda do mercado. Compra livremente em AGUARDAR e COMPRAR, entrando antes da confirmacao com alvos elevados. Para traders experientes.",
    caracteristicas: [
      "Score minimo 55 — entra antes da massa",
      "Dominancia acima de 46% — sinal leve ja e suficiente",
      "Maximo 6 posicoes — maxima exposicao agressiva",
      "Stop Loss de 7% — aguenta grandes oscilacoes",
      "Take Profit de 20% — busca movimentos explosivos",
      "Compra em AGUARDAR sem esperar confirmacao final",
      "Opera qualquer ativo com tendencia positiva nascente",
    ],
    pontos_fortes: ["Retorno potencial de 20% por operacao", "6 posicoes simultâneas", "Captura os maiores movimentos do dia"],
    pontos_fracos: ["Alto drawdown possivel", "Win rate menor que perfis conservadores", "Exige psicologico solido"],
  },
  {
    id: "agr_promax", nome: "Agressivo", nivel: "PRO MAX", perfil: "Agressivo", emoji: "⚡", cor: "#b45309",
    score_compra: 45, score_venda: 28, bull_pct_min: 42, max_posicoes: 7, sl_pct: 0.08, tp_pct: 0.25, aguardar_ok: true,
    descricao: "Configuracao maxima de risco. Compra em qualquer status (AGUARDAR ou COMPRAR) desde que haja inclinacao bullish. Maximo de posicoes e maiores alvos da plataforma.",
    caracteristicas: [
      "Score minimo 52 — opera em praticamente todos os sinais",
      "Dominancia acima de 44% — qualquer inclinacao positiva",
      "Maximo 7 posicoes — maxima exposicao possivel",
      "Stop Loss de 8% — resiste a choques de mercado",
      "Take Profit de 25% — busca movimentos extraordinarios",
      "Compra em AGUARDAR e COMPRAR sem restricao de status",
      "Alta frequencia de operacoes diarias",
    ],
    pontos_fortes: ["TP de 25% por operacao", "7 posicoes simultaneas", "Maximo de oportunidades de toda a plataforma", "Um dia bom pode superar a semana inteira"],
    pontos_fracos: ["Risco elevadissimo", "Sequencias de stop podem esgotar a banca", "Nao recomendado para iniciantes"],
  },

  // ── Alavancados ──
  {
    id: "cons_alav", nome: "Conservador", nivel: "Alavancado", perfil: "Conservador", emoji: "🔱", cor: "#06b6d4",
    capital_inicial: 100000, stake_base: 5000, stake_dupla_score: 88,
    score_compra: 70, score_venda: 45, bull_pct_min: 58, max_posicoes: 3, sl_pct: 0.02, tp_pct: 0.05, aguardar_ok: false,
    descricao: "Opera com R$ 5.000 por entrada em tendencias fortissimas com SL de 2% e alvo de 5%. Em oportunidades excepcionais (score 88+) dobra a stake para R$ 10.000. RR 1:2,5 — entra rapido e sai rapido preservando capital.",
    caracteristicas: [
      "Score minimo 78 — so as melhores oportunidades do dia",
      "Dominancia de compradores acima de 63%",
      "Stake padrao R$ 5.000 por operacao",
      "Score 88+ dobra a stake para R$ 10.000 automaticamente",
      "Stop Loss de 1% — corta a perda imediatamente",
      "Take Profit de 2% — projecao curta, sai rapido",
      "Maximo 3 posicoes — concentracao em sinais cirurgicos",
      "Exige status COMPRAR e tendencia forte confirmada",
    ],
    pontos_fortes: ["Ganhos rapidos de 2% com R$ 5k-10k", "SL de 1% limita o risco", "Entra so nos melhores sinais do dia", "Capital de R$ 50k aguenta sequencias de stops"],
    pontos_fracos: ["Poucas operacoes (criterio muito alto)", "TP pequeno exige disciplina para nao segurar", "SL de 1% pode ser atingido em volatilidade normal"],
  },
  {
    id: "mod_alav", nome: "Moderado", nivel: "Alavancado", perfil: "Moderado", emoji: "🔱", cor: "#0ea5e9",
    capital_inicial: 100000, stake_base: 5000, stake_dupla_score: 85,
    score_compra: 67, score_venda: 42, bull_pct_min: 55, max_posicoes: 4, sl_pct: 0.025, tp_pct: 0.06, aguardar_ok: false,
    descricao: "Opera R$ 5.000 por entrada com SL de 2,5% e alvo de 6% (RR 1:2,4). Em oportunidades muito boas (score 85+) dobra para R$ 10.000. Equilibra quantidade de entradas com seguranca do capital alavancado.",
    caracteristicas: [
      "Score minimo 73 — sinais de alta qualidade",
      "Dominancia de compradores acima de 58%",
      "Stake padrao R$ 5.000 por operacao",
      "Score 85+ dobra a stake para R$ 10.000 automaticamente",
      "Stop Loss de 1,5% — apertado para capital alavancado",
      "Take Profit de 2,5% — projecao curta e objetiva",
      "Maximo 4 posicoes — diversificacao controlada",
      "Exige status COMPRAR — nao opera em AGUARDAR",
    ],
    pontos_fortes: ["2,5% de TP com R$ 5k-10k = ganho expressivo", "Mais entradas que o Conservador Alavancado", "4 posicoes permite diversificacao", "Capital de R$ 50k como base"],
    pontos_fracos: ["SL 1,5% pode ser tocado em criptos volateis", "Projecao curta nao captura movimentos longos", "Exige monitoramento das posicoes abertas"],
  },
  {
    id: "agr_alav", nome: "Agressivo", nivel: "Alavancado", perfil: "Agressivo", emoji: "🔱", cor: "#f97316",
    capital_inicial: 100000, stake_base: 5000, stake_dupla_score: 82,
    score_compra: 63, score_venda: 38, bull_pct_min: 52, max_posicoes: 5, sl_pct: 0.03, tp_pct: 0.07, aguardar_ok: false,
    descricao: "Perfil alavancado com mais entradas. Opera R$ 5.000 por trade e dobra para R$ 10.000 com score 82+. SL de 3% e alvo de 7% (RR 1:2,3). Alta frequencia com capital de R$ 100k para absorver sequencias.",
    caracteristicas: [
      "Score minimo 68 — captura mais oportunidades que os demais alavancados",
      "Dominancia de compradores acima de 55%",
      "Stake padrao R$ 5.000 por operacao",
      "Score 82+ dobra a stake para R$ 10.000 automaticamente",
      "Stop Loss de 2% — tolerancia ligeiramente maior",
      "Take Profit de 3% — projecao curta com alvo superior",
      "Maximo 5 posicoes — maior exposicao entre os alavancados",
      "Exige tendencia forte — nao opera em AGUARDAR",
    ],
    pontos_fortes: ["3% de TP com capital de R$ 5k-10k por trade", "5 posicoes — mais oportunidades", "Score 68 captura mais sinais que os outros alavancados", "Melhor frequencia de operacoes do grupo alavancado"],
    pontos_fracos: ["2% de SL com 5 posicoes pode gerar drawdown relevante", "Mais operacoes = mais exposicao ao risco", "Capital de R$ 50k pode reduzir rapido em sequencia de stops"],
  },

  // ── Subida ── (entram APENAS em AGUARDAR, score 30–79, SL curto, TP longo)
  {
    id: "sub_cons", nome: "Subida", nivel: "Normal" as "Normal", perfil: "Conservador", emoji: "📈", cor: "#22c55e",
    capital_inicial: 100000, stake_base: 500,
    score_compra: 48, score_max_compra: 79, score_venda: 33, bull_pct_min: 51, max_posicoes: 3,
    sl_pct: 0.02, tp_pct: 0.18, aguardar_ok: false, apenas_aguardar: true,
    descricao: "Tenta capturar o inicio da subida quando o ativo ainda esta em AGUARDAR. Entra cedo com SL curto e aguarda uma projecao longa de 15%. Stake de R$ 500 para testar o movimento antes de confirmar.",
    caracteristicas: [
      "Entra APENAS quando status e AGUARDAR — nunca em COMPRAR",
      "Score entre 55 e 79 — ativo em formacao de alta mas nao confirmado",
      "Bull % acima de 53% — leve dominancia dos compradores",
      "Stake R$ 500 — entrada leve para testar o movimento",
      "Stop Loss curto de 1,5% — corta rapido se errar a direcao",
      "Take Profit de 15% — aguarda a subida completa do ativo",
      "Maximo 3 posicoes — seleciona os melhores setups",
    ],
    pontos_fortes: ["Entra antes da confirmacao e captura o movimento inteiro", "SL de 1,5% limita muito o risco", "TP de 15% com R$ 500 = R$ 75 por operacao", "Stake pequena = pode acumular varias posicoes sem grande exposicao"],
    pontos_fracos: ["Muitos falsos positivos pois entra antes da confirmacao", "Pode demorar muito para o TP ser atingido", "Exige paciencia — o ativo pode ficar em AGUARDAR por horas"],
  },
  {
    id: "sub_mod", nome: "Subida", nivel: "PRO" as "PRO", perfil: "Moderado", emoji: "📈", cor: "#16a34a",
    capital_inicial: 100000, stake_base: 500,
    score_compra: 40, score_max_compra: 79, score_venda: 30, bull_pct_min: 48, max_posicoes: 4,
    sl_pct: 0.025, tp_pct: 0.20, aguardar_ok: false, apenas_aguardar: true,
    descricao: "Versao intermediaria do perfil Subida. Entra mais cedo (score 45+) e busca uma projecao de 18%. Captura movimentos em formacao antes da massa identificar. Stake de R$ 500.",
    caracteristicas: [
      "Entra APENAS quando status e AGUARDAR — nao opera em COMPRAR",
      "Score entre 45 e 79 — entra mais cedo que o Conservador Subida",
      "Bull % acima de 50% — qualquer maioria de compradores",
      "Stake R$ 500 — entrada controlada",
      "Stop Loss de 2% — ligeiramente mais tolerante",
      "Take Profit de 18% — projecao mais ambiciosa",
      "Maximo 4 posicoes — maior diversificacao de ativos em subida",
    ],
    pontos_fortes: ["Entra antes do Conservador — mais cedo no movimento", "TP de 18% por operacao com stake R$ 500", "4 posicoes simultaneas em subida", "Boa relacao risco/retorno 1:9"],
    pontos_fracos: ["Mais falsos positivos que o Conservador por entrar mais cedo", "SL de 2% pode ser atingido em volatilidade normal do cripto", "Paciencia necessaria enquanto ativo consolida"],
  },
  {
    id: "sub_agr", nome: "Subida", nivel: "PRO MAX" as "PRO MAX", perfil: "Agressivo", emoji: "📈", cor: "#15803d",
    capital_inicial: 100000, stake_base: 500,
    score_compra: 32, score_max_compra: 79, score_venda: 28, bull_pct_min: 45, max_posicoes: 5,
    sl_pct: 0.03, tp_pct: 0.25, aguardar_ok: false, apenas_aguardar: true,
    descricao: "Versao mais agressiva do perfil Subida. Entra com score a partir de 35, quando o ativo ainda esta no inicio de qualquer inclinacao positiva. Projecao de 22% com stake R$ 500.",
    caracteristicas: [
      "Entra APENAS em AGUARDAR — nunca espera o COMPRAR",
      "Score entre 35 e 79 — entra no nascimento do movimento",
      "Bull % acima de 47% — qualquer inclinacao de compradores",
      "Stake R$ 500 — entrada pequena para muitas posicoes",
      "Stop Loss de 2,5% — tolerancia a oscilacao inicial",
      "Take Profit de 22% — maximo alvo do grupo Subida",
      "Maximo 5 posicoes — maxima diversificacao em ativos nascentes",
    ],
    pontos_fortes: ["Entra no inicio absoluto do movimento", "TP de 22% por operacao", "5 posicoes em ativos diferentes em subida", "Com R$ 500 por trade, 5 posicoes = so R$ 2.500 de exposicao"],
    pontos_fracos: ["Score 35 e muito arriscado — muitas falsas entradas", "SL de 2,5% acionado frequentemente em criptos volateis", "Exige banca para absorver sequencia de stops antes do acerto grande"],
  },
  {
    id: "sub_alav", nome: "Subida", nivel: "Alavancado" as "Alavancado", perfil: "Agressivo", emoji: "📈🔱", cor: "#84cc16",
    capital_inicial: 100000, stake_base: 500, stake_dupla_score: 73,
    score_compra: 44, score_max_compra: 79, score_venda: 30, bull_pct_min: 49, max_posicoes: 4,
    sl_pct: 0.02, tp_pct: 0.25, aguardar_ok: false, apenas_aguardar: true,
    descricao: "Perfil Subida com capital alavancado de R$ 25.000. Stake padrao R$ 500, dobra para R$ 1.000 quando score atingir 73+. Projeta subidas de 20% com SL curto de 1,5%. Combina entrada antecipada com poder de capital ampliado.",
    caracteristicas: [
      "Entra APENAS em AGUARDAR — antecipa o movimento",
      "Score entre 50 e 79 — equilibra precocidade e qualidade",
      "Stake padrao R$ 500 — entrada conservadora",
      "Score 73+ dobra a stake para R$ 1.000 automaticamente",
      "Stop Loss de 1,5% — protege o capital alavancado",
      "Take Profit de 20% — projecao longa e ambiciosa",
      "Capital de R$ 25.000 — suporta sequencias sem esgotamento",
      "Maximo 4 posicoes em ativos com subida nascente",
    ],
    pontos_fortes: ["Capital de R$ 25k aguenta muitos stops antes de um grande acerto", "Stake dupla de R$ 1k em oportunidades 73+", "TP de 20% por operacao", "Melhor custo-beneficio do grupo Subida"],
    pontos_fracos: ["SL de 1,5% e apertado mesmo com capital maior", "Entrada em AGUARDAR gera mais stops que perfis normais", "Paciencia necessaria para o TP de 20% ser atingido"],
  },
];

function emptyWallet(capital = 100000): SimWallet {
  return { saldo_inicial: capital, saldo_livre: capital, positions: {}, trades: [], criado: new Date().toISOString() };
}

function useWallet() {
  const [w, setW] = useState<SimWallet>(() => {
    try { const s = localStorage.getItem(WALLET_KEY); return s ? JSON.parse(s) : emptyWallet(); }
    catch { return emptyWallet(); }
  });

  const upd = (fn: (p: SimWallet) => SimWallet) => setW(prev => {
    const next = fn(prev);
    try { localStorage.setItem(WALLET_KEY, JSON.stringify(next)); } catch {}
    return next;
  });

  const comprar = useCallback((simbolo: string, price_usd: number, usd_brl: number, score: number, auto = false) => {
    upd(prev => {
      if (prev.positions[simbolo]) return prev;
      if (prev.saldo_livre < TRADE_SIZE * 0.5) return prev;
      const amount    = Math.min(TRADE_SIZE, prev.saldo_livre);
      const fee       = amount * FEE_RATE;       // 0,06% de corretagem
      const effective = amount - fee;             // valor que realmente compra crypto
      const price_brl = price_usd * usd_brl;
      const units     = effective / price_brl;   // unidades compradas (já descontada a taxa)
      const pos: SimPos = { simbolo, units, amount_brl: amount, price_usd, price_brl,
        last_price_usd: price_usd, last_usd_brl: usd_brl, time: Date.now(), score_entry: score };
      const trade: SimTrade = { id: `${Date.now()}-${simbolo}-C`, simbolo, tipo: "C",
        price_brl, amount_brl: amount, fee, time: Date.now(), score, auto };
      return { ...prev, saldo_livre: prev.saldo_livre - amount,
        positions: { ...prev.positions, [simbolo]: pos }, trades: [...prev.trades, trade] };
    });
  }, []);

  const vender = useCallback((simbolo: string, price_usd: number, usd_brl: number, score: number, auto = false) => {
    upd(prev => {
      const pos = prev.positions[simbolo];
      if (!pos) return prev;
      const price_brl = price_usd * usd_brl;
      const sell_value = pos.units * price_brl;
      const pnl_brl = sell_value - pos.amount_brl;
      const pct = (pnl_brl / pos.amount_brl) * 100;
      const trade: SimTrade = { id: `${Date.now()}-${simbolo}-V`, simbolo, tipo: "V",
        price_brl, amount_brl: sell_value, pnl_brl, pct, time: Date.now(), score, auto };
      const { [simbolo]: _removed, ...rest } = prev.positions;
      return { ...prev, saldo_livre: prev.saldo_livre + sell_value, positions: rest, trades: [...prev.trades, trade] };
    });
  }, []);

  const atualizarPrecos = useCallback((items: ScanItem[]) => {
    upd(prev => {
      let changed = false;
      const np = { ...prev.positions };
      for (const it of items) {
        if (np[it.simbolo]) {
          np[it.simbolo] = { ...np[it.simbolo], last_price_usd: it.preco, last_usd_brl: it.usd_brl ?? np[it.simbolo].last_usd_brl };
          changed = true;
        }
      }
      return changed ? { ...prev, positions: np } : prev;
    });
  }, []);

  const reset = useCallback(() => { const w = emptyWallet(); setW(w); try { localStorage.setItem(WALLET_KEY, JSON.stringify(w)); } catch {} }, []);

  return { wallet: w, comprar, vender, atualizarPrecos, reset };
}

// ── Multi-Wallet (9 perfis independentes) ────────────────────────────────────

function emptyMultiWallet(): Record<string, SimWallet> {
  return Object.fromEntries(PERFIS.map(p => [p.id, emptyWallet(p.capital_inicial ?? 100000)]));
}

function useMultiWallet() {
  const [wallets, setWallets] = useState<Record<string, SimWallet>>(() => {
    try {
      const s = localStorage.getItem(MULTI_WALLET_KEY);
      if (s) {
        const parsed = JSON.parse(s) as Record<string, SimWallet>;
        const base = emptyMultiWallet();
        return { ...base, ...parsed };
      }
    } catch {}
    return emptyMultiWallet();
  });

  const persist = (next: Record<string, SimWallet>) => {
    try { localStorage.setItem(MULTI_WALLET_KEY, JSON.stringify(next)); } catch {}
    return next;
  };

  const upd = (fn: (p: Record<string, SimWallet>) => Record<string, SimWallet>) =>
    setWallets(prev => persist(fn(prev)));

  const comprarPerfil = useCallback((perfilId: string, simbolo: string, price_usd: number, usd_brl: number, score: number, auto = false) => {
    const cfg = PERFIS.find(p => p.id === perfilId);
    if (!cfg) return;
    upd(prev => {
      const w = prev[perfilId];
      if (!w) return prev;
      if (w.positions[simbolo]) return prev;
      // sem limite de posições — compra enquanto houver saldo
      const stakeBase  = cfg.stake_base ?? TRADE_SIZE;
      const stakeAlvo  = (cfg.stake_dupla_score != null && score >= cfg.stake_dupla_score)
        ? stakeBase * 2   // dobra a stake em oportunidade excepcional
        : stakeBase;
      const amount = Math.min(stakeAlvo, w.saldo_livre);
      if (amount < 50) return prev;
      const fee = amount * FEE_RATE;
      const price_brl = price_usd * usd_brl;
      const units = (amount - fee) / price_brl;
      const pos: SimPos = {
        simbolo, units, amount_brl: amount, price_usd, price_brl,
        last_price_usd: price_usd, last_usd_brl: usd_brl, time: Date.now(), score_entry: score,
        stop_loss_price: price_brl * (1 - cfg.sl_pct),
        take_profit_price: price_brl * (1 + cfg.tp_pct),
        sl_pct: cfg.sl_pct, tp_pct: cfg.tp_pct,
      };
      const trade: SimTrade = {
        id: `${Date.now()}-${perfilId}-${simbolo}-C`, simbolo, tipo: "C",
        price_brl, amount_brl: amount, fee, time: Date.now(), score, auto,
        motivo_entrada: `Score ${score} | ${cfg.perfil} ${cfg.nivel}${cfg.stake_dupla_score != null && score >= cfg.stake_dupla_score ? " | STAKE DOBRADA" : ""}`,
        stop_loss: pos.stop_loss_price, take_profit: pos.take_profit_price,
        sl_pct: cfg.sl_pct, tp_pct: cfg.tp_pct,
      };
      return { ...prev, [perfilId]: {
        ...w, saldo_livre: w.saldo_livre - amount,
        positions: { ...w.positions, [simbolo]: pos },
        trades: [...w.trades, trade],
      }};
    });
  }, []);

  const venderPerfil = useCallback((perfilId: string, simbolo: string, price_usd: number, usd_brl: number, score: number, auto = false, motivo_saida?: string) => {
    upd(prev => {
      const w = prev[perfilId];
      if (!w) return prev;
      const pos = w.positions[simbolo];
      if (!pos) return prev;
      const price_brl = price_usd * usd_brl;
      const sell_value = pos.units * price_brl;
      const pnl_brl = sell_value - pos.amount_brl;
      const trade: SimTrade = {
        id: `${Date.now()}-${perfilId}-${simbolo}-V`, simbolo, tipo: "V",
        price_brl, amount_brl: sell_value, pnl_brl, pct: (pnl_brl / pos.amount_brl) * 100,
        time: Date.now(), score, auto, motivo_saida,
      };
      const { [simbolo]: _r, ...rest } = w.positions;
      return { ...prev, [perfilId]: {
        ...w, saldo_livre: w.saldo_livre + sell_value, positions: rest, trades: [...w.trades, trade],
      }};
    });
  }, []);

  const atualizarTodos = useCallback((items: ScanItem[]) => {
    upd(prev => {
      const next = { ...prev };
      for (const [pid, w] of Object.entries(next)) {
        const np = { ...w.positions };
        let ch = false;
        for (const it of items) {
          if (np[it.simbolo]) {
            np[it.simbolo] = { ...np[it.simbolo], last_price_usd: it.preco, last_usd_brl: it.usd_brl ?? np[it.simbolo].last_usd_brl };
            ch = true;
          }
        }
        if (ch) next[pid] = { ...w, positions: np };
      }
      return next;
    });
  }, []);

  const resetPerfil = useCallback((perfilId: string) => {
    const cfg = PERFIS.find(p => p.id === perfilId);
    upd(prev => ({ ...prev, [perfilId]: emptyWallet(cfg?.capital_inicial ?? 100000) }));
  }, []);

  const resetAll = useCallback(() => {
    const w = emptyMultiWallet();
    setWallets(w);
    try { localStorage.setItem(MULTI_WALLET_KEY, JSON.stringify(w)); } catch {}
  }, []);

  return { wallets, comprarPerfil, venderPerfil, atualizarTodos, resetPerfil, resetAll };
}

// ── Banco de Dados Histórico ─────────────────────────────────────────────────

const BANCO_KEY = "allwin_dt_banco_v1";

interface BancoEntry {
  id: string;
  ts: number;
  data: string;       // "09/07/2026"
  hora: string;       // "14:35"
  perfil_id: string;
  perfil_nome: string;
  perfil_nivel: string;
  perfil_emoji: string;
  perfil_cor: string;
  capital: number;
  saldo_livre: number;
  pnl: number;
  roi: number;
  ops_fechadas: number;
  win_rate: number;
  profit_factor: number;
  drawdown: number;
  total_taxas: number;
  n_posicoes: number;
  trades: SimTrade[];
}

function walletToEntry(cfg: PerfilConfig, w: SimWallet): BancoEntry {
  const s = calcWalletStats(w);
  const vendas = w.trades.filter(t => t.tipo === "V");
  const wins   = vendas.filter(t => (t.pnl_brl ?? 0) > 0);
  const losses = vendas.filter(t => (t.pnl_brl ?? 0) < 0);
  const soma_g = wins.reduce((a, t) => a + (t.pnl_brl ?? 0), 0);
  const soma_p = Math.abs(losses.reduce((a, t) => a + (t.pnl_brl ?? 0), 0));
  const taxas  = w.trades.filter(t => t.tipo === "C").reduce((a, t) => a + (t.fee ?? 0), 0);
  const now    = new Date();
  return {
    id: `${cfg.id}-${Date.now()}`,
    ts: Date.now(),
    data: now.toLocaleDateString("pt-BR"),
    hora: now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
    perfil_id: cfg.id, perfil_nome: cfg.nome, perfil_nivel: cfg.nivel,
    perfil_emoji: cfg.emoji, perfil_cor: cfg.cor,
    capital: s.capital, saldo_livre: w.saldo_livre,
    pnl: s.pnl, roi: s.roi,
    ops_fechadas: s.ops, win_rate: s.win_rate, profit_factor: s.profit_factor,
    drawdown: s.drawdown, total_taxas: taxas, n_posicoes: s.posicoes,
    trades: w.trades,
  };
}

function useBanco() {
  const [banco, setBanco] = useState<BancoEntry[]>(() => {
    try { const s = localStorage.getItem(BANCO_KEY); return s ? JSON.parse(s) : []; }
    catch { return []; }
  });

  const salvar = useCallback((entries: BancoEntry[]) => {
    setBanco(prev => {
      const next = [...entries, ...prev];
      try { localStorage.setItem(BANCO_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);

  const remover = useCallback((id: string) => {
    setBanco(prev => {
      const next = prev.filter(e => e.id !== id);
      try { localStorage.setItem(BANCO_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);

  const removerData = useCallback((data: string) => {
    setBanco(prev => {
      const next = prev.filter(e => e.data !== data);
      try { localStorage.setItem(BANCO_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);

  return { banco, salvar, remover, removerData };
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmt(n: number | undefined | null, decimals = 2): string {
  if (n == null) return "—";
  if (Math.abs(n) >= 1e9) return (n / 1e9).toFixed(1) + "B";
  if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(1) + "M";
  if (Math.abs(n) >= 1e4) return n.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
  return n.toFixed(decimals);
}

function fmtPrice(n: number | undefined | null, usd_brl?: number): string {
  if (n == null) return "—";
  const dUsd = n >= 1000 ? 0 : n >= 1 ? 2 : n >= 0.01 ? 4 : 6;
  const usdStr = `$${fmt(n, dUsd)}`;
  if (!usd_brl) return usdStr;
  const v = n * usd_brl;
  const dBrl = v >= 1000 ? 2 : v >= 1 ? 2 : v >= 0.01 ? 4 : 6;
  return `R$ ${fmt(v, dBrl)} · ${usdStr}`;
}

function PricePair({ n, usd_brl, mainClass = "font-bold text-[var(--text-primary)]" }:
  { n?: number | null; usd_brl?: number; mainClass?: string }) {
  if (n == null) return <span>—</span>;
  const dUsd = n >= 1000 ? 0 : n >= 1 ? 2 : n >= 0.01 ? 4 : 6;
  if (!usd_brl) return <span className={mainClass}>${fmt(n, dUsd)}</span>;
  const v = n * usd_brl;
  const dBrl = v >= 1000 ? 2 : v >= 1 ? 2 : v >= 0.01 ? 4 : 6;
  return (
    <span className="flex flex-col leading-tight">
      <span className={mainClass}>R$ {fmt(v, dBrl)}</span>
      <span className="text-[10px] text-[var(--text-secondary)] font-normal opacity-70">${fmt(n, dUsd)}</span>
    </span>
  );
}

function fmtPct(n: number | undefined | null): string {
  if (n == null) return "—";
  return (n > 0 ? "+" : "") + n.toFixed(2) + "%";
}

function scoreColor(s: number): string {
  if (s >= 80) return "#10b981";
  if (s >= 65) return "#84cc16";
  if (s >= 50) return "#f59e0b";
  if (s >= 35) return "#f97316";
  return "#ef4444";
}

function sinalizador(s: string | undefined): string {
  if (!s) return "🔘";
  if (s === "compra") return "🟢";
  if (s === "venda") return "🔴";
  return "🟡";
}

// ── Micro Components ───────────────────────────────────────────────────────────

function ScoreGauge({ score, cor, size = 110 }: { score: number; cor: string; size?: number }) {
  const r = 44;
  const cx = size / 2;
  const cy = size * 0.55;
  const total = Math.PI * r;
  const dash = (score / 100) * total;

  const x1 = cx - r, y1 = cy;
  const x2 = cx + r, y2 = cy;

  return (
    <svg width={size} height={size * 0.65} viewBox={`0 0 ${size} ${size * 0.65}`}>
      <path d={`M ${x1},${y1} A ${r},${r} 0 0,1 ${x2},${y2}`}
        fill="none" stroke="var(--border)" strokeWidth="10" strokeLinecap="round" />
      <path d={`M ${x1},${y1} A ${r},${r} 0 0,1 ${x2},${y2}`}
        fill="none" stroke={cor} strokeWidth="10" strokeLinecap="round"
        strokeDasharray={`${dash} ${total}`} />
      <text x={cx} y={cy - 6} textAnchor="middle" fill={cor}
        fontSize="20" fontWeight="bold">{score.toFixed(0)}</text>
      <text x={cx} y={cy + 6} textAnchor="middle" fill="var(--text-secondary)"
        fontSize="8" fontWeight="600">PROBABILIDADE</text>
    </svg>
  );
}

function Estrelas({ n }: { n: number }) {
  return (
    <span className="text-base leading-none">
      {[1,2,3,4,5].map(i => (
        <span key={i} className={i <= n ? "text-yellow-400" : "text-gray-600"}>★</span>
      ))}
    </span>
  );
}

function DecisaoBadge({ decisao, cor }: { decisao: string; cor: string }) {
  return (
    <span className="px-2.5 py-1 rounded-lg text-xs font-bold text-white tracking-wide"
      style={{ backgroundColor: cor }}>
      {decisao}
    </span>
  );
}

function VarChip({ v }: { v: number | undefined | null }) {
  if (v == null) return <span className="text-[var(--text-secondary)] text-xs">—</span>;
  const pos = v >= 0;
  return (
    <span className={`text-xs font-semibold ${pos ? "text-emerald-400" : "text-red-400"}`}>
      {pos ? "▲" : "▼"} {Math.abs(v).toFixed(2)}%
    </span>
  );
}

function BuyBar({ buy, sell }: { buy: number; sell: number }) {
  return (
    <div className="w-full">
      <div className="flex justify-between text-[10px] font-semibold mb-0.5">
        <span className="text-emerald-400">C {buy.toFixed(0)}%</span>
        <span className="text-red-400">V {sell.toFixed(0)}%</span>
      </div>
      <div className="h-2 rounded-full bg-red-500/30 overflow-hidden">
        <div className="h-full rounded-full bg-emerald-500 transition-all duration-500"
          style={{ width: `${buy}%` }} />
      </div>
    </div>
  );
}

function ScoreBar({ score, cor }: { score: number; cor: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full bg-[var(--border)] overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${score}%`, backgroundColor: cor }} />
      </div>
      <span className="text-xs font-bold tabular-nums" style={{ color: cor }}>{score.toFixed(0)}</span>
    </div>
  );
}

// ── Ranking Card ───────────────────────────────────────────────────────────────

function CoinCard({ item, usd_brl, wallet, onBuy, onSelect }:
  { item: ScanItem; usd_brl?: number; wallet?: SimWallet; onBuy?: () => void; onSelect: () => void }) {
  const cor = item.cor || scoreColor(item.score);
  const inWallet = !!wallet?.positions[item.simbolo];
  return (
    <button onClick={onSelect}
      className="w-full text-left p-4 rounded-xl border border-[var(--border)] bg-[var(--bg-card)]
                 hover:border-emerald-500/50 hover:shadow-lg transition-all duration-200 group"
      style={{ borderLeftWidth: 3, borderLeftColor: cor }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-2xl" style={{ color: cor }}>{COIN_ICONS[item.simbolo] ?? "◯"}</span>
          <div>
            <div className="font-bold text-[var(--text-primary)] text-sm">{item.simbolo}</div>
            <PricePair n={item.preco} usd_brl={usd_brl} mainClass="text-[10px] text-[var(--text-secondary)]" />
          </div>
        </div>
        <div className="text-right">
          <DecisaoBadge decisao={item.decisao} cor={cor} />
          <div className="mt-1"><Estrelas n={item.estrelas} /></div>
        </div>
      </div>

      {/* Score bar */}
      <div className="mb-2">
        <ScoreBar score={item.score} cor={cor} />
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-1 text-[10px] mb-2">
        <div className="text-center bg-[var(--bg)] rounded p-1">
          <div className="text-[var(--text-secondary)]">24h</div>
          <VarChip v={item.var24h} />
        </div>
        <div className="text-center bg-[var(--bg)] rounded p-1">
          <div className="text-[var(--text-secondary)]">RSI</div>
          <span className={`font-semibold ${
            (item.rsi ?? 50) > 70 ? "text-red-400" : (item.rsi ?? 50) < 30 ? "text-emerald-400" : "text-[var(--text-primary)]"
          }`}>{fmt(item.rsi, 0) ?? "—"}</span>
        </div>
        <div className="text-center bg-[var(--bg)] rounded p-1">
          <div className="text-[var(--text-secondary)]">R:R</div>
          <span className="font-semibold text-[var(--text-primary)]">{item.rr1 ? `1:${item.rr1}` : "—"}</span>
        </div>
      </div>

      {/* Buy pressure */}
      <BuyBar buy={item.buy_pct} sell={100 - item.buy_pct} />

      {/* Patterns */}
      {(item.padroes?.length ?? 0) > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {item.padroes!.slice(0, 2).map((p, i) => (
            <span key={i} className="px-1.5 py-0.5 rounded text-[9px] bg-[var(--bg)] text-[var(--text-secondary)] border border-[var(--border)]">
              {p}
            </span>
          ))}
        </div>
      )}

      {/* Wallet action */}
      {inWallet ? (
        <div className="mt-2 flex items-center justify-between">
          <span className="text-[9px] text-emerald-400 font-semibold">✓ Em carteira</span>
          <span className="text-[9px] text-[var(--text-secondary)] group-hover:text-emerald-400 transition-colors">Ver análise →</span>
        </div>
      ) : (
        <div className="mt-2 flex items-center justify-between">
          {onBuy && item.operar && item.bullish ? (
            <button onClick={e => { e.stopPropagation(); onBuy(); }}
              className="px-3 py-1 rounded-lg text-[10px] font-bold bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20 transition-colors">
              + Comprar R${TRADE_SIZE.toLocaleString()}
            </button>
          ) : <span />}
          <span className="text-[9px] text-[var(--text-secondary)] group-hover:text-emerald-400 transition-colors">Ver análise →</span>
        </div>
      )}
    </button>
  );
}

// ── Multi-TF Table ─────────────────────────────────────────────────────────────

const TFS = ["1d", "4h", "1h", "30m", "15m", "5m", "1m"];
const TF_LABELS: Record<string, string> = {
  "1d": "Diário", "4h": "4 Horas", "1h": "1 Hora",
  "30m": "30 Min", "15m": "15 Min", "5m": "5 Min", "1m": "1 Min",
};

function MultiTFTable({ tfs }: { tfs: Record<string, TFResult> }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="border-b border-[var(--border)]">
            <th className="text-left py-2 px-3 text-[var(--text-secondary)] font-semibold">TF</th>
            <th className="text-center py-2 px-2 text-[var(--text-secondary)] font-semibold">Score</th>
            <th className="text-center py-2 px-2 text-[var(--text-secondary)] font-semibold">Tendência</th>
            <th className="text-center py-2 px-2 text-[var(--text-secondary)] font-semibold">RSI</th>
            <th className="text-center py-2 px-2 text-[var(--text-secondary)] font-semibold">MACD</th>
            <th className="text-center py-2 px-2 text-[var(--text-secondary)] font-semibold">ADX</th>
            <th className="text-center py-2 px-2 text-[var(--text-secondary)] font-semibold">Stoch</th>
            <th className="text-center py-2 px-2 text-[var(--text-secondary)] font-semibold">Compra</th>
          </tr>
        </thead>
        <tbody>
          {TFS.map(tf => {
            const r = tfs[tf];
            if (!r?.valido) return (
              <tr key={tf} className="border-b border-[var(--border)]/30 opacity-40">
                <td className="py-2 px-3 font-semibold text-[var(--text-secondary)]">{tf.toUpperCase()}</td>
                <td colSpan={7} className="py-2 px-2 text-center text-[var(--text-secondary)]">sem dados</td>
              </tr>
            );
            const sc = r.score ?? 50;
            const cor = scoreColor(sc);
            const ind = r.indicadores ?? {};
            const rsi = ind.rsi;
            const macd = ind.macd;
            const adx = ind.adx;
            const stoch = ind.stoch;
            const bp = r.compradores?.buy_pct ?? 50;

            return (
              <tr key={tf} className="border-b border-[var(--border)]/30 hover:bg-[var(--bg)] transition-colors">
                <td className="py-2 px-3">
                  <span className="font-bold text-[var(--text-primary)]">{tf.toUpperCase()}</span>
                  <div className="text-[9px] text-[var(--text-secondary)]">{TF_LABELS[tf]}</div>
                </td>
                <td className="py-2 px-2 text-center">
                  <span className="font-bold text-sm" style={{ color: cor }}>{sc.toFixed(0)}</span>
                  <div className="w-12 h-1 rounded-full bg-[var(--border)] mx-auto mt-0.5 overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${sc}%`, backgroundColor: cor }} />
                  </div>
                </td>
                <td className="py-2 px-2 text-center">
                  {r.tendencia ? (
                    <span className={`font-semibold text-[10px] ${
                      r.tendencia.direcao === "bullish" ? "text-emerald-400" :
                      r.tendencia.direcao === "bearish" ? "text-red-400" : "text-amber-400"
                    }`}>
                      {r.tendencia.direcao === "bullish" ? "▲" : r.tendencia.direcao === "bearish" ? "▼" : "→"}{" "}
                      {r.tendencia.tipo}
                    </span>
                  ) : <span className="text-[var(--text-secondary)]">—</span>}
                </td>
                <td className="py-2 px-2 text-center">
                  {rsi != null ? (
                    <span className={`font-semibold ${rsi > 70 ? "text-red-400" : rsi < 30 ? "text-emerald-400" : "text-[var(--text-primary)]"}`}>
                      {rsi.toFixed(0)}
                    </span>
                  ) : <span className="text-[var(--text-secondary)]">—</span>}
                </td>
                <td className="py-2 px-2 text-center">
                  {macd ? (
                    <span className={`font-semibold ${macd.sinal === "compra" ? "text-emerald-400" : "text-red-400"}`}>
                      {macd.histograma > 0 ? "▲" : "▼"} {Math.abs(macd.histograma).toExponential(1)}
                    </span>
                  ) : <span className="text-[var(--text-secondary)]">—</span>}
                </td>
                <td className="py-2 px-2 text-center">
                  {adx?.adx != null ? (
                    <span className={`font-semibold ${adx.direcao === "alta" ? "text-emerald-400" : "text-red-400"}`}>
                      {adx.adx.toFixed(0)}
                      <span className="text-[var(--text-secondary)] font-normal"> {adx.sinal === "forte" ? "●" : "○"}</span>
                    </span>
                  ) : <span className="text-[var(--text-secondary)]">—</span>}
                </td>
                <td className="py-2 px-2 text-center">
                  {stoch ? (
                    <span className={`font-semibold text-[10px] ${
                      stoch.overbought ? "text-red-400" : stoch.oversold ? "text-emerald-400" : "text-[var(--text-primary)]"
                    }`}>
                      K{stoch.k.toFixed(0)} D{stoch.d.toFixed(0)}
                    </span>
                  ) : <span className="text-[var(--text-secondary)]">—</span>}
                </td>
                <td className="py-2 px-2 text-center">
                  <span className={`font-semibold text-[11px] ${bp > 55 ? "text-emerald-400" : bp < 45 ? "text-red-400" : "text-amber-400"}`}>
                    {bp.toFixed(0)}%
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Níveis Card ────────────────────────────────────────────────────────────────

function NiveisCard({ niveis, cor, usd_brl }: { niveis: Niveis; cor: string; usd_brl?: number }) {
  const isBuy = niveis.tipo === "COMPRA";
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] overflow-hidden">
      <div className="px-4 py-3 flex items-center gap-3" style={{ backgroundColor: cor + "22" }}>
        <span className="text-2xl font-black" style={{ color: cor }}>{isBuy ? "↑" : "↓"}</span>
        <div>
          <div className="font-bold text-sm" style={{ color: cor }}>{niveis.tipo}</div>
          <div className="text-[10px] text-[var(--text-secondary)]">ATR: {niveis.atr_pct?.toFixed(2)}%</div>
        </div>
        <div className="ml-auto text-right">
          <div className="text-xs text-[var(--text-secondary)]">Entrada</div>
          <PricePair n={niveis.entrada} usd_brl={usd_brl} />
        </div>
      </div>

      <div className="p-4 space-y-3">
        {/* Stop */}
        <div className="flex items-center justify-between p-2.5 rounded-lg bg-red-500/10 border border-red-500/20">
          <div>
            <div className="text-[10px] text-red-400 font-semibold">STOP LOSS</div>
            <PricePair n={niveis.stop} usd_brl={usd_brl} mainClass="font-bold text-red-400" />
          </div>
          <div className="text-right">
            <div className="text-xs text-red-400/70">Risco</div>
            <div className="font-semibold text-red-400">{niveis.stop_pct?.toFixed(2)}%</div>
          </div>
        </div>

        {/* Alvos */}
        {([
          { label: "ALVO 1", val: niveis.alvo1, pct: niveis.alvo1_pct, rr: niveis.rr1 },
          { label: "ALVO 2", val: niveis.alvo2, pct: niveis.alvo2_pct, rr: niveis.rr2 },
          { label: "ALVO 3", val: niveis.alvo3, pct: niveis.alvo3_pct, rr: niveis.rr3 },
        ] as const).map(({ label, val, pct, rr }) => (
          <div key={label} className="flex items-center justify-between p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
            <div>
              <div className="text-[10px] text-emerald-400 font-semibold">{label}</div>
              <PricePair n={val} usd_brl={usd_brl} mainClass="font-bold text-emerald-400" />
            </div>
            <div className="text-right">
              <div className="text-xs text-emerald-400/70">+{pct?.toFixed(2)}%</div>
              <div className="font-semibold text-emerald-400">R:R 1:{rr}</div>
            </div>
          </div>
        ))}

        {/* S/R */}
        <div className="grid grid-cols-2 gap-2 mt-1">
          <div className="p-2 rounded-lg bg-[var(--bg)] border border-[var(--border)] text-center">
            <div className="text-[9px] text-[var(--text-secondary)]">Suporte</div>
            <div className="text-xs font-semibold text-emerald-400">{fmtPrice(niveis.suporte, usd_brl)}</div>
          </div>
          <div className="p-2 rounded-lg bg-[var(--bg)] border border-[var(--border)] text-center">
            <div className="text-[9px] text-[var(--text-secondary)]">Resistência</div>
            <div className="text-xs font-semibold text-red-400">{fmtPrice(niveis.resistencia, usd_brl)}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Indicators Grid ────────────────────────────────────────────────────────────

function IndGrid({ tf, usd_brl }: { tf: TFResult | undefined; usd_brl?: number }) {
  if (!tf?.valido || !tf.indicadores) return null;
  const ind = tf.indicadores;
  const bp = tf.compradores;

  const items = [
    { label: "RSI (14)", val: ind.rsi?.toFixed(1), sig: ind.rsi != null ? (ind.rsi > 70 ? "venda" : ind.rsi < 30 ? "compra" : "neutro") : undefined },
    { label: "MACD Hist", val: ind.macd?.histograma?.toExponential(2), sig: ind.macd?.sinal },
    { label: "ADX", val: ind.adx?.adx?.toFixed(1), sig: ind.adx ? (ind.adx.direcao === "alta" ? "compra" : "venda") : undefined },
    { label: "Stoch K/D", val: ind.stoch ? `${ind.stoch.k.toFixed(0)}/${ind.stoch.d.toFixed(0)}` : undefined, sig: ind.stoch ? (ind.stoch.oversold ? "compra" : ind.stoch.overbought ? "venda" : "neutro") : undefined },
    { label: "Williams %R", val: ind.williams_r?.toFixed(1), sig: ind.williams_r != null ? (ind.williams_r < -80 ? "compra" : ind.williams_r > -20 ? "venda" : "neutro") : undefined },
    { label: "CCI (20)", val: ind.cci?.toFixed(1), sig: ind.cci != null ? (ind.cci > 100 ? "compra" : ind.cci < -100 ? "venda" : "neutro") : undefined },
    { label: "MFI (14)", val: ind.mfi?.toFixed(1), sig: ind.mfi != null ? (ind.mfi > 70 ? "venda" : ind.mfi < 30 ? "compra" : "neutro") : undefined },
    { label: "ROC (10)", val: ind.roc != null ? fmtPct(ind.roc) : undefined, sig: ind.roc != null ? (ind.roc > 0 ? "compra" : "venda") : undefined },
    { label: "VWAP", val: ind.vwap != null ? fmtPrice(ind.vwap, usd_brl) : undefined, sig: ind.vwap && tf.preco ? (tf.preco > ind.vwap ? "compra" : "venda") : undefined },
    { label: "Bollinger", val: ind.bollinger?.sinal?.toUpperCase(), sig: ind.bollinger?.sinal },
    { label: "Supertrend", val: ind.supertrend != null ? (ind.supertrend.bullish ? "ALTA" : "BAIXA") : undefined, sig: ind.supertrend != null ? (ind.supertrend.bullish ? "compra" : "venda") : undefined },
    { label: "ATR%", val: ind.atr_pct != null ? `${ind.atr_pct?.toFixed(2)}%` : undefined, sig: "neutro" },
    { label: "Compradores", val: bp ? `${bp.buy_pct.toFixed(0)}%` : undefined, sig: bp ? (bp.buy_pct > 55 ? "compra" : bp.buy_pct < 45 ? "venda" : "neutro") : undefined },
    { label: "Vendedores", val: bp ? `${bp.sell_pct.toFixed(0)}%` : undefined, sig: bp ? (bp.sell_pct > 55 ? "venda" : "neutro") : undefined },
    { label: "EMA9", val: ind.ema9 != null ? fmtPrice(ind.ema9, usd_brl) : undefined, sig: ind.ema9 && tf.preco ? (tf.preco > ind.ema9 ? "compra" : "venda") : undefined },
    { label: "EMA21", val: ind.ema21 != null ? fmtPrice(ind.ema21, usd_brl) : undefined, sig: ind.ema21 && tf.preco ? (tf.preco > ind.ema21 ? "compra" : "venda") : undefined },
    { label: "EMA50", val: ind.ema50 != null ? fmtPrice(ind.ema50, usd_brl) : undefined, sig: ind.ema50 && tf.preco ? (tf.preco > ind.ema50 ? "compra" : "venda") : undefined },
    { label: "EMA200", val: ind.ema200 != null ? fmtPrice(ind.ema200, usd_brl) : undefined, sig: ind.ema200 && tf.preco ? (tf.preco > ind.ema200 ? "compra" : "venda") : undefined },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
      {items.filter(i => i.val != null).map(({ label, val, sig }) => (
        <div key={label} className="p-2.5 rounded-lg bg-[var(--bg)] border border-[var(--border)]">
          <div className="text-[9px] text-[var(--text-secondary)] mb-0.5">{label}</div>
          <div className="flex items-center gap-1">
            <span className="text-[10px]">{sinalizador(sig)}</span>
            <span className={`text-xs font-semibold ${
              sig === "compra" ? "text-emerald-400" :
              sig === "venda" ? "text-red-400" : "text-[var(--text-primary)]"
            }`}>{val}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Patterns Section ───────────────────────────────────────────────────────────

function PadroesSection({ tfs }: { tfs: Record<string, TFResult> }) {
  const all: Array<{ tf: string; nome: string }> = [];
  for (const [tf, r] of Object.entries(tfs)) {
    if (r.valido && r.padroes) {
      for (const p of r.padroes) {
        all.push({ tf, nome: p.nome });
      }
    }
  }
  if (all.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {all.map((p, i) => (
        <span key={i} className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium
          bg-[var(--bg)] border border-[var(--border)] text-[var(--text-secondary)]">
          <span className="font-bold text-amber-400">{p.tf.toUpperCase()}</span>
          {p.nome}
        </span>
      ))}
    </div>
  );
}

// ── Detail View ────────────────────────────────────────────────────────────────

function DetailView({ simbolo, onBack, wallet, onBuy, onSell }:
  { simbolo: string; onBack: () => void; wallet: SimWallet; onBuy: (price: number, usd_brl: number, score: number) => void; onSell: (price: number, usd_brl: number, score: number) => void }) {
  const [data, setData] = useState<DaytradeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showAllTFs, setShowAllTFs] = useState(false);

  // Active TF for indicator grid
  const [activeTF, setActiveTF] = useState("15m");

  useEffect(() => {
    setLoading(true);
    setError("");
    fetch(`${API}/cripto/daytrade/${simbolo}`)
      .then(r => r.json())
      .then(d => {
        if (d.erro) setError(d.erro);
        else setData(d);
      })
      .catch(() => setError("Falha ao conectar com a API"))
      .finally(() => setLoading(false));
  }, [simbolo]);

  if (loading) return (
    <div className="flex flex-col items-center justify-center py-20 gap-3">
      <div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      <div className="text-[var(--text-secondary)] text-sm">Analisando {simbolo} em 7 timeframes…</div>
      <div className="text-[var(--text-secondary)] text-xs">Buscando dados da Binance API</div>
    </div>
  );

  if (error || !data) return (
    <div className="text-center py-16">
      <p className="text-red-400 mb-4">{error || "Sem dados"}</p>
      <button onClick={onBack} className="px-4 py-2 rounded-lg bg-[var(--bg-card)] border border-[var(--border)] text-sm hover:border-emerald-500 transition-colors">
        ← Voltar ao Ranking
      </button>
    </div>
  );

  const cor = data.cor || scoreColor(data.score);
  const mainTF = data.timeframes?.[activeTF] || data.timeframes?.["15m"] || data.timeframes?.["1h"];

  const validTFs = TFS.filter(tf => data.timeframes?.[tf]?.valido);

  return (
    <div className="space-y-4">
      {/* Back + Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <button onClick={onBack}
          className="flex items-center gap-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors">
          ← Ranking
        </button>
        <div className="flex-1 flex items-center gap-3 flex-wrap">
          <span className="text-4xl font-black" style={{ color: cor }}>
            {COIN_ICONS[data.simbolo] ?? "◯"}
          </span>
          <div>
            <div className="text-xl font-black text-[var(--text-primary)]">{data.simbolo}</div>
            <PricePair n={data.preco_atual} usd_brl={data.usd_brl}
              mainClass={`text-2xl font-bold`} />
          </div>
          <VarChip v={data.var24h} />
          <div className="ml-auto flex flex-col items-end gap-2">
            <DecisaoBadge decisao={data.decisao} cor={cor} />
            <Estrelas n={data.estrelas} />
            {/* Wallet buttons */}
            {wallet.positions[simbolo] ? (
              <button onClick={() => onSell(data.preco_atual, data.usd_brl ?? 5.2, data.score)}
                className="px-3 py-1.5 rounded-lg text-xs font-bold bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20 transition-colors">
                Vender Simulado
              </button>
            ) : (
              <button onClick={() => onBuy(data.preco_atual, data.usd_brl ?? 5.2, data.score)}
                className="px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20 transition-colors">
                + Comprar R${TRADE_SIZE.toLocaleString()}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Score + Consenso */}
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4 flex flex-col items-center gap-3">
          <ScoreGauge score={data.score} cor={cor} size={140} />
          <div className="text-center">
            <div className="font-bold text-[var(--text-primary)] text-sm">{data.consenso.desc}</div>
            <div className="text-[10px] text-[var(--text-secondary)] mt-1">
              {data.consenso.tfs_bullish}/{data.consenso.tfs_validos} timeframes bullish
            </div>
          </div>
          {/* TF consensus dots */}
          <div className="flex gap-2 flex-wrap justify-center">
            {TFS.map(tf => {
              const r = data.timeframes?.[tf];
              if (!r?.valido) return <span key={tf} className="px-1.5 py-0.5 rounded text-[9px] bg-[var(--bg)] text-gray-600 border border-[var(--border)]">{tf}</span>;
              const sc = r.score ?? 50;
              return (
                <span key={tf} className="px-1.5 py-0.5 rounded text-[9px] font-bold border"
                  style={{ color: scoreColor(sc), borderColor: scoreColor(sc) + "40", backgroundColor: scoreColor(sc) + "15" }}>
                  {tf} {sc.toFixed(0)}
                </span>
              );
            })}
          </div>

          {/* Buy pressure */}
          <div className="w-full">
            <BuyBar buy={data.compradores.buy_pct} sell={data.compradores.sell_pct} />
            <div className="text-center text-[10px] text-[var(--text-secondary)] mt-1">
              {data.compradores.dominant === "compradores" ? "🟢" : data.compradores.dominant === "vendedores" ? "🔴" : "🟡"}{" "}
              {data.compradores.dominant.charAt(0).toUpperCase() + data.compradores.dominant.slice(1)} dominam
            </div>
          </div>
        </div>

        {/* Níveis */}
        <div className="lg:col-span-2">
          <NiveisCard niveis={data.niveis} cor={cor} usd_brl={data.usd_brl} />
        </div>
      </div>

      {/* Multi-TF Table */}
      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
        <h3 className="font-bold text-[var(--text-primary)] mb-3 text-sm">Análise Multi-Timeframe</h3>
        <MultiTFTable tfs={data.timeframes} />
      </div>

      {/* Indicator grid — selectable TF */}
      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <h3 className="font-bold text-[var(--text-primary)] text-sm">Indicadores</h3>
          <div className="flex gap-1 flex-wrap">
            {validTFs.map(tf => (
              <button key={tf}
                onClick={() => setActiveTF(tf)}
                className={`px-2 py-0.5 rounded text-[10px] font-bold border transition-colors ${
                  activeTF === tf
                    ? "border-emerald-500 bg-emerald-500/10 text-emerald-400"
                    : "border-[var(--border)] text-[var(--text-secondary)] hover:border-emerald-500/40"
                }`}>
                {tf.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
        <IndGrid tf={data.timeframes?.[activeTF]} usd_brl={data.usd_brl} />
      </div>

      {/* Padrões */}
      {Object.values(data.timeframes).some(r => r.valido && (r.padroes?.length ?? 0) > 0) && (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
          <h3 className="font-bold text-[var(--text-primary)] mb-3 text-sm">Padrões Detectados</h3>
          <PadroesSection tfs={data.timeframes} />
        </div>
      )}

      {/* Fibonacci do 1h */}
      {(() => {
        const fib = data.timeframes?.["1h"]?.fibonacci || data.timeframes?.["4h"]?.fibonacci;
        if (!fib) return null;
        return (
          <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
            <h3 className="font-bold text-[var(--text-primary)] mb-3 text-sm">Níveis de Fibonacci (1H)</h3>
            <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
              {Object.entries(fib.niveis).map(([ratio, price]) => {
                const isNear = data.preco_atual && Math.abs(data.preco_atual - (price as number)) / data.preco_atual < 0.02;
                return (
                  <div key={ratio} className={`p-2 rounded-lg text-center border ${
                    isNear ? "border-amber-400/60 bg-amber-400/10" : "border-[var(--border)] bg-[var(--bg)]"
                  }`}>
                    <div className="text-[9px] text-amber-400 font-semibold">{ratio}</div>
                    <div className="text-[10px] text-[var(--text-primary)] font-mono">
                      {fmtPrice(price as number, data.usd_brl)}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* Justificativa */}
      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4"
        style={{ borderLeftWidth: 3, borderLeftColor: cor }}>
        <h3 className="font-bold text-[var(--text-primary)] mb-2 text-sm">Análise da IA</h3>
        <p className="text-sm text-[var(--text-secondary)] leading-relaxed">{data.justificativa}</p>
        {data.fear_greed != null && (
          <div className="mt-2 text-xs text-[var(--text-secondary)]">
            Fear & Greed: <span className="font-semibold text-[var(--text-primary)]">{data.fear_greed}/100</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Ranking View ───────────────────────────────────────────────────────────────

const RANK_TABS = [
  { key: "geral",        label: "Geral" },
  { key: "top_compras",  label: "Top Compras" },
  { key: "top_vendas",   label: "Top Vendas" },
  { key: "top_rr",       label: "Melhor R:R" },
  { key: "top_volume",   label: "Maior Volume" },
  { key: "top_momentum", label: "Momentum" },
] as const;

type RankKey = typeof RANK_TABS[number]["key"];

function RankingView({ onSelect, wallet, onBuy, onScanUpdate }:
  { onSelect: (s: string) => void; wallet: SimWallet; onBuy: (item: ScanItem, usd_brl: number) => void; onScanUpdate?: (items: ScanItem[], usd_brl: number) => void }) {
  const [data, setData] = useState<ScanData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<RankKey>("geral");
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  const fetchScan = useCallback(() => {
    setLoading(true);
    setError("");
    fetch(`${API}/cripto/daytrade/scan`)
      .then(r => r.json())
      .then(d => {
        setData(d);
        setLastUpdate(new Date());
        if (d.geral && onScanUpdate) onScanUpdate(d.geral, d.usd_brl ?? 5.2);
      })
      .catch(() => setError("Falha ao conectar. Verifique se o backend está rodando."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchScan(); }, [fetchScan]);

  const items: ScanItem[] = data ? (data[activeTab] ?? data.geral) : [];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div>
          <h2 className="text-lg font-black text-[var(--text-primary)]">🎯 Day Trade IA</h2>
          <p className="text-xs text-[var(--text-secondary)]">
            Análise multi-timeframe em tempo real • {data?.total ?? "—"} moedas monitoradas
            {lastUpdate && <> • Atualizado {lastUpdate.toLocaleTimeString("pt-BR")}</>}
            {data?.usd_brl && <> • <span className="font-semibold text-emerald-400">USD/BRL R$ {data.usd_brl.toFixed(2)}</span></>}
          </p>
        </div>
        <button
          onClick={fetchScan}
          disabled={loading}
          className="ml-auto flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30
            text-emerald-400 text-sm font-semibold hover:bg-emerald-500/20 transition-colors disabled:opacity-50">
          {loading ? (
            <><span className="w-3 h-3 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" /> Escaneando…</>
          ) : (
            <><span>⟳</span> Escanear</>
          )}
        </button>
      </div>

      {/* Stats strip */}
      {data && !loading && (
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
          {[
            { label: "Escaneadas", val: data.total },
            { label: "Compras", val: data.top_compras.length, cor: "#10b981" },
            { label: "Vendas", val: data.top_vendas.length, cor: "#ef4444" },
            { label: "Op. Prontas", val: data.geral.filter(r => r.operar).length, cor: "#84cc16" },
            { label: "Score Médio", val: data.geral.length ? (data.geral.reduce((a, b) => a + b.score, 0) / data.geral.length).toFixed(0) : "—" },
            { label: "Aguardar", val: data.geral.filter(r => !r.operar).length, cor: "#f59e0b" },
          ].map(({ label, val, cor }) => (
            <div key={label} className="p-2 rounded-lg bg-[var(--bg-card)] border border-[var(--border)] text-center">
              <div className="text-[9px] text-[var(--text-secondary)]">{label}</div>
              <div className="text-base font-black" style={{ color: cor ?? "var(--text-primary)" }}>{val}</div>
            </div>
          ))}
        </div>
      )}

      {/* Sub-tabs */}
      <div className="flex gap-1 flex-wrap">
        {RANK_TABS.map(({ key, label }) => (
          <button key={key} onClick={() => setActiveTab(key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab === key
                ? "bg-emerald-500 text-white"
                : "bg-[var(--bg-card)] border border-[var(--border)] text-[var(--text-secondary)] hover:border-emerald-500/40"
            }`}>
            {label}
          </button>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div className="p-4 rounded-xl border border-red-500/30 bg-red-500/10 text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Loading skeleton */}
      {loading && !data && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-48 rounded-xl bg-[var(--bg-card)] border border-[var(--border)] animate-pulse" />
          ))}
        </div>
      )}

      {/* Cards grid */}
      {items.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {items.map(item => (
            <CoinCard key={item.simbolo} item={item} usd_brl={data?.usd_brl}
              wallet={wallet} onBuy={() => onBuy(item, data?.usd_brl ?? 5.2)}
              onSelect={() => onSelect(item.simbolo)} />
          ))}
        </div>
      )}

      {!loading && items.length === 0 && !error && (
        <div className="text-center py-12 text-[var(--text-secondary)]">
          Nenhuma oportunidade nesta categoria no momento.
        </div>
      )}
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

// ── PDF Export ────────────────────────────────────────────────────────────────

function exportarPDF(
  wallet: SimWallet,
  ops: Array<{ n: number; simbolo: string; auto: boolean; compra: SimTrade; venda?: SimTrade; status: string; pos?: SimPos; curr_val?: number }>,
  totalInvestido: number, totalRetorno: number, totalPnl: number,
  totalTaxas: number, win_rate: number | null
) {
  const fmtH = (ms: number) => new Date(ms).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const fmtD = (ms: number) => new Date(ms).toLocaleDateString("pt-BR");
  const f2   = (n: number) => n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const f4   = (n: number, p: number) => n.toLocaleString("pt-BR", { minimumFractionDigits: p >= 1 ? 2 : 4, maximumFractionDigits: p >= 1 ? 2 : 4 });

  const rows = ops.map(op => {
    const pnl     = op.venda?.pnl_brl;
    const pct     = op.venda?.pct;
    const retorno = op.venda ? op.venda.amount_brl : (op.curr_val ?? op.compra.amount_brl);
    const pnlOpen = op.curr_val != null ? op.curr_val - op.compra.amount_brl : null;
    const pctOpen = pnlOpen != null ? (pnlOpen / op.compra.amount_brl) * 100 : null;
    const lucro   = op.venda ? (pnl ?? 0) >= 0 : (pnlOpen ?? 0) >= 0;
    const resCor  = op.status === "aberto" ? "#b45309" : lucro ? "#16a34a" : "#dc2626";
    const resTxt  = op.status === "aberto" ? "EM ABERTO" : lucro ? "LUCRO" : "PREJUIZO";
    const taxaVal = op.compra.fee ?? 0;
    return `
      <tr>
        <td>${op.n}</td>
        <td><b>${op.simbolo}</b>${op.auto ? ' <small style="background:#fef3c7;color:#b45309;padding:1px 4px;border-radius:3px">AUTO</small>' : ""}</td>
        <td>${fmtD(op.compra.time)}<br><small>${fmtH(op.compra.time)}</small></td>
        <td class="num">R$ ${f4(op.compra.price_brl, op.compra.price_brl)}</td>
        <td class="num">R$ ${f2(op.compra.amount_brl)}</td>
        <td class="num taxa">R$ ${f2(taxaVal)}</td>
        <td>${op.venda ? `${fmtD(op.venda.time)}<br><small>${fmtH(op.venda.time)}</small>` : '<span style="color:#b45309">—</span>'}</td>
        <td class="num">${op.venda ? `R$ ${f4(op.venda.price_brl, op.venda.price_brl)}` : op.pos ? `<span style="color:#b45309">R$ ${f4(op.pos.last_price_usd * op.pos.last_usd_brl, op.pos.last_price_usd * op.pos.last_usd_brl)}</span>` : "—"}</td>
        <td class="num">R$ ${f2(retorno)}</td>
        <td class="num"><b style="color:${resCor}">${op.venda && pnl != null ? `${pnl >= 0 ? "+" : ""}R$ ${f2(Math.abs(pnl))}` : pnlOpen != null ? `${pnlOpen >= 0 ? "+" : ""}R$ ${f2(Math.abs(pnlOpen))}` : "—"}</b></td>
        <td class="num"><b style="color:${resCor}">${op.venda && pct != null ? `${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%` : pctOpen != null ? `${pctOpen >= 0 ? "+" : ""}${pctOpen.toFixed(2)}%` : "—"}</b></td>
        <td style="text-align:center"><span style="padding:3px 8px;border-radius:4px;font-size:10px;font-weight:bold;background:${op.status === "aberto" ? "#fef3c7" : lucro ? "#dcfce7" : "#fee2e2"};color:${resCor}">${resTxt}</span></td>
      </tr>`;
  }).join("");

  const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
<title>Relatorio Day Trade — AllWin</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:Arial,sans-serif;font-size:11px;color:#111;padding:24px}
  h1{font-size:20px;font-weight:900;margin-bottom:2px}
  .sub{color:#666;font-size:10px;margin-bottom:20px}
  .stats{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:20px}
  .stat{padding:12px;border:1px solid #e0e0e0;border-radius:6px}
  .stat .lbl{font-size:9px;color:#888;text-transform:uppercase;letter-spacing:.5px}
  .stat .val{font-size:17px;font-weight:900;margin-top:2px}
  .stat .sub2{font-size:10px;margin-top:1px}
  table{width:100%;border-collapse:collapse;margin-top:8px}
  th{background:#f5f5f5;padding:7px 6px;text-align:left;font-size:9px;text-transform:uppercase;border-bottom:2px solid #ccc;white-space:nowrap}
  td{padding:6px 6px;border-bottom:1px solid #eee;vertical-align:middle;white-space:nowrap}
  td.num{text-align:right;font-family:monospace}
  td.taxa{color:#b45309}
  tr:nth-child(even){background:#fafafa}
  .section{margin-top:20px;padding:14px;background:#f9f9f9;border:1px solid #e0e0e0;border-radius:6px}
  .section h3{font-size:11px;text-transform:uppercase;letter-spacing:.5px;color:#555;margin-bottom:10px}
  .sg{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}
  .sg .item label{font-size:9px;color:#888;display:block}
  .sg .item span{font-size:14px;font-weight:900}
  .footer{margin-top:24px;text-align:center;color:#aaa;font-size:9px;border-top:1px solid #eee;padding-top:12px}
  @page{margin:1.5cm}
</style></head><body>
<h1>Relatorio Day Trade — AllWin</h1>
<p class="sub">Gerado em ${new Date().toLocaleString("pt-BR")} &nbsp;|&nbsp; Capital inicial: R$ ${f2(wallet.saldo_inicial)} &nbsp;|&nbsp; Taxa de corretagem: ${(FEE_RATE * 100).toFixed(1)}% por compra</p>

<div class="stats">
  <div class="stat"><div class="lbl">Saldo Atual</div><div class="val">R$ ${f2(wallet.saldo_livre + ops.filter(o => !o.venda && o.curr_val).reduce((a, o) => a + (o.curr_val ?? 0), 0))}</div></div>
  <div class="stat"><div class="lbl">P&L Total</div><div class="val" style="color:${totalPnl >= 0 ? "#16a34a" : "#dc2626"}">${totalPnl >= 0 ? "+" : ""}R$ ${f2(Math.abs(totalPnl))}</div><div class="sub2" style="color:${totalPnl >= 0 ? "#16a34a" : "#dc2626"}">${totalInvestido > 0 ? ((totalPnl / totalInvestido) * 100).toFixed(2) : "0.00"}%</div></div>
  <div class="stat"><div class="lbl">Total em Taxas (0,06%)</div><div class="val" style="color:#b45309">R$ ${f2(totalTaxas)}</div><div class="sub2" style="color:#888">${ops.filter(o => o.compra.fee).length} operacoes</div></div>
  <div class="stat"><div class="lbl">Taxa de Acerto</div><div class="val" style="color:${win_rate != null && win_rate >= 50 ? "#16a34a" : "#dc2626"}">${win_rate != null ? win_rate.toFixed(0) + "%" : "—"}</div><div class="sub2" style="color:#888">${ops.filter(o => o.venda).length} encerradas</div></div>
</div>

<table>
<thead><tr>
  <th>#</th><th>Moeda</th><th>Data/Hora Compra</th><th style="text-align:right">Preco Compra</th>
  <th style="text-align:right">Investido</th><th style="text-align:right">Taxa (0,6%)</th>
  <th>Data/Hora Venda</th><th style="text-align:right">Preco Venda</th>
  <th style="text-align:right">Retorno</th><th style="text-align:right">P&L (R$)</th>
  <th style="text-align:right">P&L (%)</th><th style="text-align:center">Resultado</th>
</tr></thead>
<tbody>${rows}</tbody>
</table>

${ops.filter(o => o.venda).length > 0 ? `
<div class="section">
  <h3>Resumo das Operacoes Encerradas</h3>
  <div class="sg">
    <div class="item"><label>Total Investido</label><span>R$ ${f2(totalInvestido)}</span></div>
    <div class="item"><label>Total Retornado</label><span>R$ ${f2(totalRetorno)}</span></div>
    <div class="item"><label>P&L Realizado</label><span style="color:${totalPnl >= 0 ? "#16a34a" : "#dc2626"}">${totalPnl >= 0 ? "+" : ""}R$ ${f2(Math.abs(totalPnl))}</span></div>
    <div class="item"><label>Total em Taxas</label><span style="color:#b45309">R$ ${f2(totalTaxas)}</span></div>
  </div>
</div>` : ""}

<p class="footer">AllWin — Plataforma de Analise Financeira &nbsp;|&nbsp; Relatorio gerado automaticamente &nbsp;|&nbsp; Valores em Reais (BRL)</p>
</body></html>`;

  const win = window.open("", "_blank", "width=1100,height=800");
  if (!win) { alert("Permita pop-ups para exportar o relatorio."); return; }
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 600);
}

// ── Banco View ────────────────────────────────────────────────────────────────

function exportarBancoPDF(entries: BancoEntry[], data: string) {
  const f2 = (n: number) => n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fH = (ms: number) => new Date(ms).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

  const carteiraRows = entries.map(e => {
    const pnlCor = e.pnl >= 0 ? "#16a34a" : "#dc2626";
    return `
      <tr style="border-bottom:1px solid #e5e7eb">
        <td style="padding:8px 10px">${e.perfil_emoji} <b>${e.perfil_nome}</b> <span style="font-size:10px;color:${e.perfil_cor}">${e.perfil_nivel}</span></td>
        <td style="padding:8px 10px;text-align:right;font-family:monospace">R$ ${f2(e.capital)}</td>
        <td style="padding:8px 10px;text-align:right;font-weight:bold;color:${pnlCor}">${e.pnl >= 0 ? "+" : ""}R$ ${f2(Math.abs(e.pnl))}</td>
        <td style="padding:8px 10px;text-align:right;font-weight:bold;color:${pnlCor}">${e.roi >= 0 ? "+" : ""}${e.roi.toFixed(2)}%</td>
        <td style="padding:8px 10px;text-align:right">${e.ops_fechadas > 0 ? e.win_rate.toFixed(0) + "%" : "—"}</td>
        <td style="padding:8px 10px;text-align:right">${e.ops_fechadas > 0 ? (e.profit_factor === 999 ? "∞" : e.profit_factor.toFixed(2)) : "—"}</td>
        <td style="padding:8px 10px;text-align:right">${e.ops_fechadas}</td>
        <td style="padding:8px 10px;text-align:right;color:#b45309">R$ ${f2(e.total_taxas)}</td>
      </tr>`;
  }).join("");

  // Operacoes detalhadas por perfil
  const opsSection = entries.map(e => {
    if (e.trades.length === 0) return "";
    const pending: Record<string, SimTrade> = {};
    const ops: Array<{ buy: SimTrade; sell?: SimTrade }> = [];
    for (const t of e.trades) {
      if (t.tipo === "C") { pending[t.simbolo] = t; }
      else { const b = pending[t.simbolo]; if (b) { ops.push({ buy: b, sell: t }); delete pending[t.simbolo]; } }
    }
    Object.values(pending).forEach(b => ops.push({ buy: b }));
    if (ops.length === 0) return "";

    const rows = ops.map((op, i) => {
      const pnl = op.sell?.pnl_brl;
      const lucro = (pnl ?? 0) >= 0;
      const resCor = !op.sell ? "#b45309" : lucro ? "#16a34a" : "#dc2626";
      return `<tr style="border-bottom:1px solid #f3f4f6;background:${i%2===0?"#fff":"#fafafa"}">
        <td style="padding:5px 8px">${i+1}</td>
        <td style="padding:5px 8px"><b>${op.buy.simbolo}</b>${op.buy.auto ? ' <small style="background:#fef3c7;padding:1px 3px;border-radius:3px;color:#b45309">AUTO</small>' : ""}</td>
        <td style="padding:5px 8px;font-size:10px">${fH(op.buy.time)}</td>
        <td style="padding:5px 8px;text-align:right;font-family:monospace">R$ ${f2(op.buy.price_brl)}</td>
        <td style="padding:5px 8px;text-align:right;font-family:monospace">R$ ${f2(op.buy.amount_brl)}</td>
        <td style="padding:5px 8px;text-align:right;color:#b45309">R$ ${f2(op.buy.fee ?? 0)}</td>
        <td style="padding:5px 8px;font-size:10px">${op.sell ? fH(op.sell.time) : "—"}</td>
        <td style="padding:5px 8px;text-align:right;font-family:monospace">${op.sell ? `R$ ${f2(op.sell.price_brl)}` : "—"}</td>
        <td style="padding:5px 8px;text-align:right;font-weight:bold;color:${resCor}">${op.sell && pnl != null ? `${pnl>=0?"+":""}R$ ${f2(Math.abs(pnl))}` : "—"}</td>
        <td style="padding:5px 8px;text-align:center"><span style="padding:2px 6px;border-radius:3px;font-size:9px;font-weight:bold;background:${!op.sell?"#fef3c7":lucro?"#dcfce7":"#fee2e2"};color:${resCor}">${!op.sell?"ABERTO":lucro?"LUCRO":"PREJUIZO"}</span></td>
      </tr>`;
    }).join("");

    return `
      <div style="margin-top:20px;page-break-inside:avoid">
        <div style="padding:8px 12px;background:${e.perfil_cor}18;border-left:3px solid ${e.perfil_cor};margin-bottom:8px">
          <b style="font-size:13px">${e.perfil_emoji} ${e.perfil_nome} ${e.perfil_nivel}</b>
          <span style="font-size:11px;color:#666;margin-left:10px">Capital: R$ ${f2(e.capital)} &nbsp;|&nbsp; P&L: <span style="color:${e.pnl>=0?"#16a34a":"#dc2626"};font-weight:bold">${e.pnl>=0?"+":""}R$ ${f2(e.pnl)}</span> (${e.roi>=0?"+":""}${e.roi.toFixed(2)}%)</span>
        </div>
        <table style="width:100%;border-collapse:collapse;font-size:11px">
          <thead><tr style="background:#f5f5f5;font-size:9px;text-transform:uppercase">
            <th style="padding:5px 8px;text-align:left">#</th>
            <th style="padding:5px 8px;text-align:left">Moeda</th>
            <th style="padding:5px 8px;text-align:left">H. Compra</th>
            <th style="padding:5px 8px;text-align:right">Preco C.</th>
            <th style="padding:5px 8px;text-align:right">Investido</th>
            <th style="padding:5px 8px;text-align:right">Taxa</th>
            <th style="padding:5px 8px;text-align:left">H. Venda</th>
            <th style="padding:5px 8px;text-align:right">Preco V.</th>
            <th style="padding:5px 8px;text-align:right">P&L</th>
            <th style="padding:5px 8px;text-align:center">Status</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  }).join("");

  const totalPnl = entries.reduce((a, e) => a + e.pnl, 0);
  const totalTaxas = entries.reduce((a, e) => a + e.total_taxas, 0);
  const melhor = entries.reduce((b, e) => e.roi > b.roi ? e : b, entries[0]);

  const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
<title>Banco AllWin — ${data}</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:Arial,sans-serif;font-size:12px;color:#111;padding:24px}
  h1{font-size:20px;font-weight:900;margin-bottom:4px}
  .sub{color:#666;font-size:10px;margin-bottom:20px}
  table{width:100%;border-collapse:collapse}
  th{background:#f5f5f5;padding:8px 10px;text-align:left;font-size:9px;text-transform:uppercase;border-bottom:2px solid #ccc}
  .footer{margin-top:24px;text-align:center;color:#aaa;font-size:9px;border-top:1px solid #eee;padding-top:12px}
  @page{margin:1.5cm}
</style></head><body>
<h1>Banco AllWin — Relatorio do Dia ${data}</h1>
<p class="sub">Gerado em ${new Date().toLocaleString("pt-BR")} &nbsp;|&nbsp; ${entries.length} perfis &nbsp;|&nbsp; P&L Total: <b style="color:${totalPnl>=0?"#16a34a":"#dc2626"}">${totalPnl>=0?"+":""}R$ ${f2(Math.abs(totalPnl))}</b> &nbsp;|&nbsp; Total em Taxas: R$ ${f2(totalTaxas)}</p>

<table>
  <thead><tr>
    <th>Perfil</th><th style="text-align:right">Capital</th><th style="text-align:right">P&L R$</th>
    <th style="text-align:right">ROI %</th><th style="text-align:right">Win Rate</th>
    <th style="text-align:right">P. Factor</th><th style="text-align:right">Ops</th><th style="text-align:right">Taxas</th>
  </tr></thead>
  <tbody>${carteiraRows}</tbody>
</table>

${melhor ? `<p style="margin-top:12px;font-size:11px;color:#555">Melhor perfil do dia: <b>${melhor.perfil_emoji} ${melhor.perfil_nome} ${melhor.perfil_nivel}</b> com ${melhor.roi>=0?"+":""}${melhor.roi.toFixed(2)}% de ROI</p>` : ""}

<h2 style="margin-top:28px;font-size:14px;border-bottom:2px solid #eee;padding-bottom:6px">Operacoes Detalhadas por Perfil</h2>
${opsSection}

<p class="footer">AllWin — Plataforma de Analise Financeira &nbsp;|&nbsp; Banco de Dados Historico</p>
</body></html>`;

  const win = window.open("", "_blank", "width=1200,height=900");
  if (!win) { alert("Permita pop-ups para exportar o PDF."); return; }
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 700);
}

// ── Sistema de Aprendizado por Perfil ────────────────────────────────────────

function computeLearnDelta(trades: SimTrade[]): number {
  const vendas = trades.filter(t => t.tipo === "V").slice(-15);
  if (vendas.length < 4) return 0;
  const wins   = vendas.filter(t => (t.pnl_brl ?? 0) > 0).length;
  const wr     = wins / vendas.length;
  const last4  = vendas.slice(-4);
  const losses4 = last4.filter(t => (t.pnl_brl ?? 0) <= 0).length;
  let delta = 0;
  if      (wr < 0.28) delta = +8;
  else if (wr < 0.38) delta = +5;
  else if (wr < 0.48) delta = +3;
  else if (wr > 0.72) delta = -4;
  else if (wr > 0.62) delta = -2;
  else if (wr > 0.55) delta = -1;
  if (losses4 >= 3) delta += 3;   // 3+ perdas seguidas: emergência
  if (losses4 === 0) delta -= 1;  // 4 wins seguidos: explorar mais
  return Math.max(-10, Math.min(10, delta));
}

function learnInfo(trades: SimTrade[], scoreBase: number): { delta: number; scoreEfetivo: number; icon: string; label: string; cor: string } {
  const delta = computeLearnDelta(trades);
  const scoreEfetivo = Math.min(Math.max(scoreBase + delta, 10), 95);
  const vendas = trades.filter(t => t.tipo === "V").slice(-15);
  if (vendas.length < 4) return { delta: 0, scoreEfetivo: scoreBase, icon: "🔄", label: "Aprendendo…", cor: "#6b7280" };
  if (delta >= 6) return { delta, scoreEfetivo, icon: "🛡️", label: `+${delta} Modo proteção`, cor: "#ef4444" };
  if (delta > 0)  return { delta, scoreEfetivo, icon: "📊", label: `+${delta} Mais seletivo`, cor: "#f59e0b" };
  if (delta <= -3) return { delta, scoreEfetivo, icon: "⚡", label: `${delta} Maximizando ops`, cor: "#10b981" };
  if (delta < 0)  return { delta, scoreEfetivo, icon: "📈", label: `${delta} Mais oportunidades`, cor: "#10b981" };
  return { delta: 0, scoreEfetivo, icon: "⚖️", label: "Calibrado", cor: "#6b7280" };
}

function BancoView({ banco, wallets, onSalvarTodos, onRemoverData }:
  { banco: BancoEntry[]; wallets: Record<string, SimWallet>; onSalvarTodos: () => void; onRemoverData: (d: string) => void }) {
  const [salvando, setSalvando]         = useState(false);
  const [filtro, setFiltro]             = useState<string>("todos");
  const [expandData, setExpandData]     = useState<string | null>(null);
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);

  const handleSalvar = async () => {
    setSalvando(true);
    try { await new Promise(r => setTimeout(r, 200)); onSalvarTodos(); }
    finally { setSalvando(false); }
  };

  // Agrupa por data
  const porData = banco.reduce<Record<string, BancoEntry[]>>((acc, e) => {
    if (!acc[e.data]) acc[e.data] = [];
    acc[e.data].push(e);
    return acc;
  }, {});
  const datas = Object.keys(porData).sort((a, b) => {
    const pa = a.split("/").reverse().join("-");
    const pb = b.split("/").reverse().join("-");
    return pb.localeCompare(pa);
  });

  const perfisLista = ["todos", ...Array.from(new Set(banco.map(e => e.perfil_id)))];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-black text-[var(--text-primary)]">Banco de Dados</h2>
          <p className="text-xs text-[var(--text-secondary)]">
            {datas.length} dias salvos • {banco.length} registros
          </p>
        </div>
        <button onClick={handleSalvar} disabled={salvando}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-500 text-white text-sm font-bold hover:bg-blue-600 transition-colors disabled:opacity-50">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>
          </svg>
          {salvando ? "Salvando..." : "Salvar Todos Agora"}
        </button>
      </div>

      {banco.length === 0 && (
        <div className="text-center py-16 text-[var(--text-secondary)]">
          <div className="text-4xl mb-3">🗄️</div>
          <div className="font-semibold">Banco vazio</div>
          <div className="text-xs mt-1">Clique em "Salvar Todos Agora" ou use o botao "Salvar Banco" dentro de cada carteira</div>
        </div>
      )}

      {/* Lista por data */}
      {datas.map(data => {
        const entries = porData[data].filter(e => filtro === "todos" || e.perfil_id === filtro);
        if (entries.length === 0) return null;
        const totalPnl   = entries.reduce((a, e) => a + e.pnl, 0);
        const totalTaxas = entries.reduce((a, e) => a + e.total_taxas, 0);
        const melhorPnl  = Math.max(...entries.map(e => e.pnl));
        const aberto     = expandData === data;
        return (
          <div key={data} className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] overflow-hidden">
            {/* Header do dia */}
            <div className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-[var(--bg)] transition-colors"
              onClick={() => setExpandData(aberto ? null : data)}>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-blue-500/15 text-blue-400 flex items-center justify-center text-sm font-black">
                  {data.split("/")[0]}
                </div>
                <div>
                  <div className="font-bold text-sm text-[var(--text-primary)]">{data}</div>
                  <div className="text-[10px] text-[var(--text-secondary)]">
                    {entries.length} perfis • Taxas R$ {totalTaxas.toFixed(2)}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-right">
                  <div className={`font-black text-base ${totalPnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                    {totalPnl >= 0 ? "+" : ""}R$ {Math.abs(totalPnl).toFixed(2)}
                  </div>
                  <div className="text-[10px] text-[var(--text-secondary)]">P&L consolidado</div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={e => { e.stopPropagation(); exportarBancoPDF(porData[data], data); }}
                    className="px-3 py-1.5 rounded-lg border border-blue-500/30 text-blue-400 text-[10px] font-semibold hover:bg-blue-500/10 transition-colors whitespace-nowrap">
                    PDF
                  </button>
                  <button onClick={e => { e.stopPropagation(); if (confirm(`Remover todos os registros de ${data}?`)) onRemoverData(data); }}
                    className="px-2 py-1.5 rounded-lg border border-red-500/20 text-red-400 text-[10px] hover:bg-red-500/10 transition-colors">
                    ✕
                  </button>
                  <span className="text-[var(--text-secondary)] text-sm">{aberto ? "▲" : "▼"}</span>
                </div>
              </div>
            </div>

            {/* Cards dos perfis (expandido) */}
            {aberto && (
              <div className="border-t border-[var(--border)] p-4">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
                  {entries.sort((a, b) => b.roi - a.roi).map(e => {
                    const isBest    = e.pnl === melhorPnl;
                    const isSelected = selectedEntryId === e.id;
                    return (
                      <div key={e.id}
                        onClick={() => setSelectedEntryId(isSelected ? null : e.id)}
                        className={`p-3 rounded-xl border cursor-pointer transition-all select-none
                          ${isBest ? "border-emerald-500/40 bg-emerald-500/5" : "border-[var(--border)] bg-[var(--bg)]"}
                          ${isSelected ? "ring-2 ring-offset-0" : "hover:border-[var(--text-secondary)]/40"}
                        `}
                        style={isSelected ? { boxShadow: `0 0 0 2px ${e.perfil_cor}60` } : {}}>
                        {isBest && <div className="text-[8px] text-emerald-400 font-bold mb-1">MELHOR DO DIA</div>}
                        <div className="flex items-center gap-1.5 mb-2">
                          <span className="text-sm">{e.perfil_emoji}</span>
                          <div>
                            <div className="text-[10px] font-bold text-[var(--text-primary)]">{e.perfil_nome}</div>
                            <div className="text-[9px]" style={{ color: e.perfil_cor }}>{e.perfil_nivel}</div>
                          </div>
                          <div className="ml-auto text-[9px] text-[var(--text-secondary)]">{e.hora}</div>
                        </div>
                        <div className={`font-black text-sm ${e.pnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                          {e.pnl >= 0 ? "+" : ""}R$ {Math.abs(e.pnl).toFixed(2)}
                        </div>
                        <div className={`text-[10px] font-semibold ${e.roi >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                          {e.roi >= 0 ? "+" : ""}{e.roi.toFixed(2)}% ROI
                        </div>
                        <div className="mt-1.5 grid grid-cols-2 gap-1 text-[9px] text-[var(--text-secondary)]">
                          <span>Capital: R$ {(e.capital / 1000).toFixed(1)}k</span>
                          <span>Ops: {e.ops_fechadas}</span>
                          <span>Win: {e.ops_fechadas > 0 ? e.win_rate.toFixed(0) + "%" : "—"}</span>
                          <span>PF: {e.ops_fechadas > 0 ? (e.profit_factor === 999 ? "∞" : e.profit_factor.toFixed(1)) : "—"}</span>
                        </div>
                        {e.trades.length > 0 && (
                          <div className="mt-2 text-[8px] font-bold text-center py-0.5 rounded" style={{ color: e.perfil_cor, background: e.perfil_cor + "18" }}>
                            {isSelected ? "▲ ocultar ops" : `▼ ver ${e.trades.length} ops`}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Tabela resumo */}
                <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
                  <table className="w-full" style={{ fontSize: "11px" }}>
                    <thead>
                      <tr className="bg-[var(--bg)] border-b border-[var(--border)] text-[var(--text-secondary)] text-[10px] uppercase">
                        <th className="px-3 py-2 text-left">Perfil</th>
                        <th className="px-3 py-2 text-right">Capital</th>
                        <th className="px-3 py-2 text-right">P&L</th>
                        <th className="px-3 py-2 text-right">ROI</th>
                        <th className="px-3 py-2 text-right">Win Rate</th>
                        <th className="px-3 py-2 text-right">P. Factor</th>
                        <th className="px-3 py-2 text-right">Drawdown</th>
                        <th className="px-3 py-2 text-right">Ops</th>
                        <th className="px-3 py-2 text-right">Taxas</th>
                        <th className="px-3 py-2 text-right">Hora</th>
                      </tr>
                    </thead>
                    <tbody>
                      {entries.sort((a, b) => b.roi - a.roi).map((e, i) => (
                        <tr key={e.id} className={`border-b border-[var(--border)]/40 ${i % 2 === 0 ? "" : "bg-[var(--bg)]/50"}`}>
                          <td className="px-3 py-2">
                            <span className="mr-1">{e.perfil_emoji}</span>
                            <span className="font-semibold text-[var(--text-primary)]">{e.perfil_nome}</span>
                            <span className="ml-1 text-[9px] font-bold" style={{ color: e.perfil_cor }}>{e.perfil_nivel}</span>
                          </td>
                          <td className="px-3 py-2 text-right font-mono">R$ {e.capital.toFixed(2)}</td>
                          <td className="px-3 py-2 text-right font-bold" style={{ color: e.pnl >= 0 ? "#10b981" : "#ef4444" }}>
                            {e.pnl >= 0 ? "+" : ""}R$ {Math.abs(e.pnl).toFixed(2)}
                          </td>
                          <td className="px-3 py-2 text-right font-bold" style={{ color: e.roi >= 0 ? "#10b981" : "#ef4444" }}>
                            {e.roi >= 0 ? "+" : ""}{e.roi.toFixed(2)}%
                          </td>
                          <td className="px-3 py-2 text-right" style={{ color: e.win_rate >= 50 ? "#10b981" : "#ef4444" }}>
                            {e.ops_fechadas > 0 ? `${e.win_rate.toFixed(0)}%` : "—"}
                          </td>
                          <td className="px-3 py-2 text-right" style={{ color: e.profit_factor >= 1 ? "#10b981" : "#ef4444" }}>
                            {e.ops_fechadas > 0 ? (e.profit_factor === 999 ? "∞" : e.profit_factor.toFixed(2)) : "—"}
                          </td>
                          <td className="px-3 py-2 text-right text-red-400">
                            {e.drawdown > 0 ? `${e.drawdown.toFixed(1)}%` : "—"}
                          </td>
                          <td className="px-3 py-2 text-right text-[var(--text-secondary)]">{e.ops_fechadas}</td>
                          <td className="px-3 py-2 text-right text-amber-400">R$ {e.total_taxas.toFixed(2)}</td>
                          <td className="px-3 py-2 text-right text-[var(--text-secondary)]">{e.hora}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Operações detalhadas do perfil selecionado */}
                {selectedEntryId && (() => {
                  const entry = entries.find(e => e.id === selectedEntryId);
                  if (!entry) return null;

                  // Pairar COMPRA (C) com VENDA (V) sequencialmente por símbolo
                  type TradePair = { buy: SimTrade; sell: SimTrade | null };
                  const pairs: TradePair[] = [];
                  const openBuys: Record<string, SimTrade> = {};
                  for (const t of entry.trades) {
                    if (t.tipo === "C") {
                      openBuys[t.simbolo] = t;
                    } else if (t.tipo === "V") {
                      if (openBuys[t.simbolo]) {
                        pairs.push({ buy: openBuys[t.simbolo], sell: t });
                        delete openBuys[t.simbolo];
                      } else {
                        pairs.push({ buy: t, sell: null });
                      }
                    }
                  }
                  // posições abertas que ainda não foram vendidas
                  for (const sym of Object.keys(openBuys)) {
                    pairs.push({ buy: openBuys[sym], sell: null });
                  }

                  const fmtTime = (ts: number) => {
                    const d = new Date(ts);
                    return `${d.toLocaleDateString("pt-BR")} ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
                  };

                  return (
                    <div className="mt-4 rounded-xl border bg-[var(--bg)] overflow-hidden" style={{ borderColor: entry.perfil_cor + "50" }}>
                      {/* Header */}
                      <div className="flex items-center justify-between px-4 py-2.5" style={{ background: entry.perfil_cor + "18", borderBottom: `1px solid ${entry.perfil_cor}30` }}>
                        <div className="flex items-center gap-2">
                          <span>{entry.perfil_emoji}</span>
                          <span className="font-black text-sm text-[var(--text-primary)]">{entry.perfil_nome}</span>
                          <span className="text-xs font-bold" style={{ color: entry.perfil_cor }}>{entry.perfil_nivel}</span>
                          <span className="text-[10px] text-[var(--text-secondary)] ml-1">— Operações ({pairs.length})</span>
                        </div>
                        <button onClick={() => setSelectedEntryId(null)}
                          className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors px-2 py-0.5 rounded border border-[var(--border)]">
                          × Fechar
                        </button>
                      </div>

                      {pairs.length === 0 ? (
                        <div className="text-center py-8 text-[var(--text-secondary)] text-xs">Nenhuma operação registrada neste salvamento</div>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full" style={{ fontSize: "11px" }}>
                            <thead>
                              <tr className="border-b border-[var(--border)] text-[var(--text-secondary)] text-[9px] uppercase tracking-wide">
                                <th className="px-3 py-2 text-left">#</th>
                                <th className="px-3 py-2 text-left">Ativo</th>
                                <th className="px-3 py-2 text-right">Preço Compra</th>
                                <th className="px-3 py-2 text-right">Valor</th>
                                <th className="px-3 py-2 text-right">Preço Venda</th>
                                <th className="px-3 py-2 text-right">P&L</th>
                                <th className="px-3 py-2 text-right">%</th>
                                <th className="px-3 py-2 text-right">Taxa</th>
                                <th className="px-3 py-2 text-right">Score</th>
                                <th className="px-3 py-2 text-left">Motivo</th>
                                <th className="px-3 py-2 text-right">Status</th>
                                <th className="px-3 py-2 text-right">Data/Hora</th>
                              </tr>
                            </thead>
                            <tbody>
                              {pairs.map(({ buy, sell }, idx) => {
                                const pnl     = sell?.pnl_brl ?? null;
                                const pct     = sell?.pct ?? null;
                                const taxa    = (buy.fee ?? 0) + (sell?.fee ?? 0);
                                const aberta  = sell === null;
                                return (
                                  <tr key={buy.id} className={`border-b border-[var(--border)]/30 ${idx % 2 === 0 ? "" : "bg-[var(--bg-card)]/50"}`}>
                                    <td className="px-3 py-2 text-[var(--text-secondary)]">{idx + 1}</td>
                                    <td className="px-3 py-2 font-bold text-[var(--text-primary)]">{buy.simbolo}</td>
                                    <td className="px-3 py-2 text-right font-mono text-blue-400">
                                      R$ {buy.price_brl.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </td>
                                    <td className="px-3 py-2 text-right font-mono text-[var(--text-secondary)]">
                                      R$ {buy.amount_brl.toFixed(2)}
                                    </td>
                                    <td className="px-3 py-2 text-right font-mono" style={{ color: aberta ? "#6b7280" : "#f59e0b" }}>
                                      {aberta ? "—" : `R$ ${sell!.price_brl.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                                    </td>
                                    <td className="px-3 py-2 text-right font-bold" style={{ color: pnl == null ? "#6b7280" : pnl >= 0 ? "#10b981" : "#ef4444" }}>
                                      {pnl == null ? "—" : `${pnl >= 0 ? "+" : ""}R$ ${Math.abs(pnl).toFixed(2)}`}
                                    </td>
                                    <td className="px-3 py-2 text-right font-bold" style={{ color: pct == null ? "#6b7280" : pct >= 0 ? "#10b981" : "#ef4444" }}>
                                      {pct == null ? "—" : `${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%`}
                                    </td>
                                    <td className="px-3 py-2 text-right text-amber-400">
                                      {taxa > 0 ? `R$ ${taxa.toFixed(2)}` : "—"}
                                    </td>
                                    <td className="px-3 py-2 text-right" style={{ color: entry.perfil_cor }}>
                                      {buy.score}
                                    </td>
                                    <td className="px-3 py-2 text-[8px] text-[var(--text-secondary)] max-w-[120px]">
                                      <div className="truncate" title={buy.motivo_entrada ?? ""}>{buy.motivo_entrada ?? "—"}</div>
                                      {sell?.motivo_saida && <div className="truncate text-red-400/70" title={sell.motivo_saida}>{sell.motivo_saida}</div>}
                                    </td>
                                    <td className="px-3 py-2 text-right">
                                      {aberta ? (
                                        <span className="text-[8px] font-bold text-amber-400 bg-amber-400/10 px-1.5 py-0.5 rounded">ABERTA</span>
                                      ) : pnl != null && pnl >= 0 ? (
                                        <span className="text-[8px] font-bold text-emerald-400 bg-emerald-400/10 px-1.5 py-0.5 rounded">WIN</span>
                                      ) : (
                                        <span className="text-[8px] font-bold text-red-400 bg-red-400/10 px-1.5 py-0.5 rounded">LOSS</span>
                                      )}
                                    </td>
                                    <td className="px-3 py-2 text-right text-[9px] text-[var(--text-secondary)] whitespace-nowrap">
                                      {fmtTime(buy.time)}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                            {/* Totals footer */}
                            <tfoot>
                              <tr className="border-t border-[var(--border)] bg-[var(--bg-card)]">
                                <td colSpan={5} className="px-3 py-2 text-[9px] text-[var(--text-secondary)] uppercase font-bold">Total</td>
                                <td className="px-3 py-2 text-right font-black text-sm" style={{ color: entry.pnl >= 0 ? "#10b981" : "#ef4444" }}>
                                  {entry.pnl >= 0 ? "+" : ""}R$ {Math.abs(entry.pnl).toFixed(2)}
                                </td>
                                <td className="px-3 py-2 text-right font-black text-sm" style={{ color: entry.roi >= 0 ? "#10b981" : "#ef4444" }}>
                                  {entry.roi >= 0 ? "+" : ""}{entry.roi.toFixed(2)}%
                                </td>
                                <td className="px-3 py-2 text-right text-amber-400 font-semibold">
                                  R$ {entry.total_taxas.toFixed(2)}
                                </td>
                                <td colSpan={4} className="px-3 py-2 text-right text-[9px] text-[var(--text-secondary)]">
                                  {entry.ops_fechadas} ops fechadas · {entry.ops_fechadas > 0 ? `Win ${entry.win_rate.toFixed(0)}%` : "sem ops"}
                                </td>
                              </tr>
                            </tfoot>
                          </table>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Perfil Info Modal ─────────────────────────────────────────────────────────

function PerfilInfoModal({ cfg, onClose }: { cfg: PerfilConfig; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.7)" }} onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="px-5 py-4 flex items-center justify-between" style={{ background: cfg.cor + "18", borderBottom: `1px solid ${cfg.cor}40` }}>
          <div className="flex items-center gap-3">
            <span className="text-3xl">{cfg.emoji}</span>
            <div>
              <div className="font-black text-lg text-[var(--text-primary)]">{cfg.nome}</div>
              <div className="text-sm font-bold" style={{ color: cfg.cor }}>{cfg.nivel}</div>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center text-[var(--text-secondary)] hover:bg-[var(--border)] transition-colors text-lg font-bold">
            ×
          </button>
        </div>

        <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
          {/* Descricao */}
          <p className="text-sm text-[var(--text-secondary)] leading-relaxed">{cfg.descricao}</p>

          {/* Parametros numericos */}
          {/* Badge especial para perfis Subida */}
          {cfg.apenas_aguardar && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-bold" style={{ background: cfg.cor + "15", borderColor: cfg.cor + "40", color: cfg.cor }}>
              <span>📈</span>
              Entra APENAS em AGUARDAR · Score {cfg.score_compra}–{cfg.score_max_compra ?? 100}
            </div>
          )}
          <div className="grid grid-cols-4 gap-2">
            {[
              { label: "Score Entrada",   val: cfg.score_max_compra != null ? `${cfg.score_compra}–${cfg.score_max_compra}` : `≥ ${cfg.score_compra}`, cor: cfg.cor },
              { label: "Bull % Min",      val: `≥ ${cfg.bull_pct_min}%`, cor: cfg.cor },
              { label: "Posicoes",        val: "Livre", cor: cfg.cor },
              { label: "Capital Inicial", val: `R$ ${((cfg.capital_inicial ?? 10000) / 1000).toFixed(0)}k`, cor: cfg.cor },
              { label: "Stop Loss",       val: `${(cfg.sl_pct * 100).toFixed(1)}%`, cor: "#ef4444" },
              { label: "Take Profit",     val: `${(cfg.tp_pct * 100).toFixed(1)}%`, cor: "#10b981" },
              { label: "Stake Padrao",    val: `R$ ${(cfg.stake_base ?? 1000).toLocaleString("pt-BR")}`, cor: "#f59e0b" },
              ...(cfg.stake_dupla_score != null ? [
                { label: "Stake Dupla", val: `Score ≥${cfg.stake_dupla_score} → R$ ${((cfg.stake_base ?? 1000) * 2).toLocaleString("pt-BR")}`, cor: "#a855f7" },
              ] : cfg.apenas_aguardar ? [
                { label: "Entra Em",      val: "SO AGUARDAR", cor: cfg.cor },
              ] : [
                { label: "Opera AGUARDAR", val: cfg.aguardar_ok ? "SIM" : "NAO", cor: cfg.aguardar_ok ? "#10b981" : "#6b7280" },
              ]),
            ].map(({ label, val, cor }) => (
              <div key={label} className={`p-2.5 rounded-xl border border-[var(--border)] bg-[var(--bg)] text-center ${label === "Stake Dupla" ? "col-span-2" : ""}`}>
                <div className="text-[9px] text-[var(--text-secondary)] mb-1 uppercase tracking-wide">{label}</div>
                <div className={`font-black ${label === "Stake Dupla" ? "text-sm" : "text-base"}`} style={{ color: cor }}>{val}</div>
              </div>
            ))}
          </div>

          {/* Caracteristicas */}
          <div>
            <div className="text-[11px] font-bold text-[var(--text-secondary)] uppercase tracking-wide mb-2">Como Opera</div>
            <ul className="space-y-1.5">
              {cfg.caracteristicas.map((c, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-[var(--text-primary)]">
                  <span className="mt-0.5 w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold flex-shrink-0" style={{ background: cfg.cor + "30", color: cfg.cor }}>{i + 1}</span>
                  {c}
                </li>
              ))}
            </ul>
          </div>

          {/* Pontos fortes / fracos */}
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 rounded-xl bg-emerald-500/8 border border-emerald-500/20">
              <div className="text-[10px] font-bold text-emerald-400 mb-2 uppercase">Pontos Fortes</div>
              <ul className="space-y-1">
                {cfg.pontos_fortes.map((p, i) => (
                  <li key={i} className="text-[11px] text-emerald-300 flex items-start gap-1.5">
                    <span className="text-emerald-400 mt-0.5">✓</span>{p}
                  </li>
                ))}
              </ul>
            </div>
            <div className="p-3 rounded-xl bg-red-500/8 border border-red-500/20">
              <div className="text-[10px] font-bold text-red-400 mb-2 uppercase">Pontos Fracos</div>
              <ul className="space-y-1">
                {cfg.pontos_fracos.map((p, i) => (
                  <li key={i} className="text-[11px] text-red-300 flex items-start gap-1.5">
                    <span className="text-red-400 mt-0.5">✗</span>{p}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Comparativo View ──────────────────────────────────────────────────────────

type SortKey = "capital" | "roi" | "pnl" | "win_rate" | "ops" | "posicoes" | "profit_factor" | "drawdown";

function calcWalletStats(w: SimWallet) {
  const positions = Object.values(w.positions);
  const valor_pos = positions.reduce((a, p) => a + p.units * p.last_price_usd * p.last_usd_brl, 0);
  const capital = w.saldo_livre + valor_pos;
  const pnl = capital - w.saldo_inicial;
  const roi = (pnl / w.saldo_inicial) * 100;
  const vendas = w.trades.filter(t => t.tipo === "V");
  const wins = vendas.filter(t => (t.pnl_brl ?? 0) > 0);
  const losses = vendas.filter(t => (t.pnl_brl ?? 0) < 0);
  const win_rate = vendas.length > 0 ? (wins.length / vendas.length) * 100 : 0;
  const soma_ganhos = wins.reduce((a, t) => a + (t.pnl_brl ?? 0), 0);
  const soma_perdas = Math.abs(losses.reduce((a, t) => a + (t.pnl_brl ?? 0), 0));
  const profit_factor = soma_perdas > 0 ? soma_ganhos / soma_perdas : soma_ganhos > 0 ? 999 : 0;
  const posicoes = positions.length;
  const pnl_posicoes = positions.reduce((a, p) => a + (p.units * p.last_price_usd * p.last_usd_brl - p.amount_brl), 0);

  // Drawdown: max queda do pico
  let peak = w.saldo_inicial, drawdown = 0;
  let running = w.saldo_inicial;
  for (const t of w.trades) {
    if (t.tipo === "C") running -= t.amount_brl;
    else { running += t.amount_brl; if (running > peak) peak = running; }
    const dd = peak > 0 ? ((peak - running) / peak) * 100 : 0;
    if (dd > drawdown) drawdown = dd;
  }

  return { capital, pnl, roi, win_rate, ops: vendas.length, posicoes, profit_factor, drawdown, pnl_posicoes };
}

function ComparativoView({ wallets, onSelect, onResetAll, onInfo }:
  { wallets: Record<string, SimWallet>; onSelect: (id: string) => void; onResetAll: () => void; onInfo: (id: string) => void }) {
  const [sort, setSort] = useState<SortKey>("roi");
  const [asc, setAsc] = useState(false);

  const rows = PERFIS.map(cfg => {
    const w = wallets[cfg.id] ?? emptyWallet(cfg.capital_inicial ?? 100000);
    return { cfg, w, stats: calcWalletStats(w) };
  });
  rows.sort((a, b) => {
    const v = (r: typeof rows[0]) => {
      if (sort === "capital") return r.stats.capital;
      if (sort === "roi") return r.stats.roi;
      if (sort === "pnl") return r.stats.pnl;
      if (sort === "win_rate") return r.stats.win_rate;
      if (sort === "ops") return r.stats.ops;
      if (sort === "posicoes") return r.stats.posicoes;
      if (sort === "profit_factor") return r.stats.profit_factor;
      if (sort === "drawdown") return r.stats.drawdown;
      return 0;
    };
    return asc ? v(a) - v(b) : v(b) - v(a);
  });

  const toggleSort = (k: SortKey) => { if (sort === k) setAsc(!asc); else { setSort(k); setAsc(false); } };
  const Th = ({ k, label }: { k: SortKey; label: string }) => (
    <th onClick={() => toggleSort(k)} className="px-3 py-2.5 text-right cursor-pointer hover:text-[var(--text-primary)] select-none whitespace-nowrap">
      {label}{sort === k ? (asc ? " ↑" : " ↓") : ""}
    </th>
  );

  const bestRoi = Math.max(...rows.map(r => r.stats.roi));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-black text-[var(--text-primary)]">Comparativo de Estrategias</h2>
          <p className="text-[11px] text-[var(--text-secondary)]">16 carteiras independentes • Capital inicial R$ 100.000 cada</p>
        </div>
        <button onClick={onResetAll} className="px-3 py-1.5 rounded-lg border border-red-500/30 text-red-400 text-xs hover:bg-red-500/10 transition-colors">
          Zerar Todas
        </button>
      </div>

      {/* Cards top 3 */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {rows.slice(0, 3).map(({ cfg, stats }, i) => (
          <button key={cfg.id} onClick={() => onSelect(cfg.id)}
            className="text-left p-4 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] hover:border-[var(--border-hover)] transition-all relative overflow-hidden">
            {i === 0 && <div className="absolute top-2 right-2 text-[10px] font-bold text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded-full">#{i+1} Melhor</div>}
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xl">{cfg.emoji}</span>
              <div>
                <div className="font-bold text-sm text-[var(--text-primary)]">{cfg.nome}</div>
                <div className="text-[10px]" style={{ color: cfg.cor }}>{cfg.nivel}</div>
              </div>
            </div>
            <div className="font-black text-xl" style={{ color: stats.roi >= 0 ? "#10b981" : "#ef4444" }}>
              {stats.roi >= 0 ? "+" : ""}{stats.roi.toFixed(2)}%
            </div>
            <div className="text-xs text-[var(--text-secondary)] mt-0.5">
              R$ {fmt(stats.capital, 2)} • {stats.ops} ops
            </div>
            <div className="mt-2 h-1 rounded-full bg-[var(--border)]">
              <div className="h-1 rounded-full transition-all" style={{
                width: `${Math.min(100, bestRoi > 0 ? (stats.roi / bestRoi) * 100 : 0)}%`,
                background: cfg.cor,
              }} />
            </div>
          </button>
        ))}
      </div>

      {/* Tabela completa */}
      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full" style={{ fontSize: "11px" }}>
            <thead>
              <tr className="border-b border-[var(--border)] text-[var(--text-secondary)] bg-[var(--bg)] text-[10px] uppercase tracking-wide">
                <th className="text-left px-3 py-2.5">Perfil</th>
                <Th k="capital" label="Capital" />
                <Th k="roi" label="ROI %" />
                <Th k="pnl" label="P&L" />
                <Th k="win_rate" label="Win Rate" />
                <Th k="profit_factor" label="P. Factor" />
                <Th k="drawdown" label="Drawdown" />
                <Th k="ops" label="Ops" />
                <Th k="posicoes" label="Abertas" />
                <th className="px-3 py-2.5 text-left">Aprendizado</th>
                <th className="px-3 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {rows.map(({ cfg, w, stats }, i) => {
                const isTop = i === 0;
                const learn = learnInfo(w.trades, cfg.score_compra);
                return (
                  <tr key={cfg.id}
                    className={`border-b border-[var(--border)]/40 hover:bg-[var(--bg)] transition-colors cursor-pointer ${isTop ? "bg-emerald-500/3" : ""}`}
                    onClick={() => onSelect(cfg.id)}>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2">
                        <span className="text-base">{cfg.emoji}</span>
                        <div>
                          <div className="font-bold text-[var(--text-primary)]">{cfg.nome}</div>
                          <div className="text-[9px] font-semibold" style={{ color: cfg.cor }}>{cfg.nivel}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-right font-mono font-semibold text-[var(--text-primary)]">
                      R$ {fmt(stats.capital, 2)}
                    </td>
                    <td className="px-3 py-3 text-right font-bold" style={{ color: stats.roi >= 0 ? "#10b981" : "#ef4444" }}>
                      {stats.roi >= 0 ? "+" : ""}{stats.roi.toFixed(2)}%
                    </td>
                    <td className="px-3 py-3 text-right font-mono" style={{ color: stats.pnl >= 0 ? "#10b981" : "#ef4444" }}>
                      {stats.pnl >= 0 ? "+" : ""}R$ {fmt(Math.abs(stats.pnl), 2)}
                    </td>
                    <td className="px-3 py-3 text-right" style={{ color: stats.win_rate >= 50 ? "#10b981" : "#ef4444" }}>
                      {stats.ops > 0 ? `${stats.win_rate.toFixed(0)}%` : "—"}
                    </td>
                    <td className="px-3 py-3 text-right" style={{ color: stats.profit_factor >= 1 ? "#10b981" : "#ef4444" }}>
                      {stats.ops > 0 ? (stats.profit_factor === 999 ? "∞" : stats.profit_factor.toFixed(2)) : "—"}
                    </td>
                    <td className="px-3 py-3 text-right text-red-400">
                      {stats.drawdown > 0 ? `${stats.drawdown.toFixed(1)}%` : "—"}
                    </td>
                    <td className="px-3 py-3 text-right text-[var(--text-secondary)]">{stats.ops}</td>
                    <td className="px-3 py-3 text-right">
                      {stats.posicoes > 0
                        ? <span className="px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 font-bold">{stats.posicoes}</span>
                        : <span className="text-[var(--text-secondary)]">—</span>}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-1.5 whitespace-nowrap">
                        <span style={{ color: learn.cor }}>{learn.icon}</span>
                        <span className="text-[9px] font-semibold" style={{ color: learn.cor }}>{learn.label}</span>
                      </div>
                      {learn.delta !== 0 && (
                        <div className="text-[8px] text-[var(--text-secondary)] ml-0.5">
                          Score: {cfg.score_compra} → <span style={{ color: learn.cor }}>{learn.scoreEfetivo}</span>
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={e => { e.stopPropagation(); onInfo(cfg.id); }}
                          className="w-6 h-6 rounded-full border border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--border-hover)] hover:text-[var(--text-primary)] transition-colors flex items-center justify-center text-[10px] font-bold"
                          title="Ver caracteristicas">i</button>
                        <span className="text-[10px] text-[var(--text-secondary)] hover:text-[var(--text-primary)]">ver →</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Parametros dos perfis */}
      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--border)] text-[11px] font-bold text-[var(--text-secondary)] uppercase tracking-wide">
          Parametros das Estrategias
        </div>
        <div className="overflow-x-auto">
          <table className="w-full" style={{ fontSize: "11px" }}>
            <thead>
              <tr className="border-b border-[var(--border)] text-[var(--text-secondary)] bg-[var(--bg)] text-[10px] uppercase">
                <th className="text-left px-3 py-2">Perfil</th>
                <th className="text-right px-3 py-2">Score Compra</th>
                <th className="text-right px-3 py-2">Bull % Min</th>
                <th className="text-right px-3 py-2">Capital</th>
                <th className="text-right px-3 py-2">Stake</th>
                <th className="text-right px-3 py-2">Max Pos.</th>
                <th className="text-right px-3 py-2">Stop Loss</th>
                <th className="text-right px-3 py-2">Take Profit</th>
              </tr>
            </thead>
            <tbody>
              {PERFIS.map(cfg => (
                <tr key={cfg.id} className="border-b border-[var(--border)]/40">
                  <td className="px-3 py-2">
                    <span className="mr-1">{cfg.emoji}</span>
                    <span className="font-semibold text-[var(--text-primary)]">{cfg.nome}</span>
                    <span className="ml-1.5 text-[9px] font-bold" style={{ color: cfg.cor }}>{cfg.nivel}</span>
                  </td>
                  <td className="px-3 py-2 text-right text-[var(--text-secondary)]">
                    {cfg.score_max_compra != null ? `${cfg.score_compra}–${cfg.score_max_compra}` : `≥ ${cfg.score_compra}`}
                  </td>
                  <td className="px-3 py-2 text-right text-[var(--text-secondary)]">≥ {cfg.bull_pct_min}%</td>
                  <td className="px-3 py-2 text-right font-semibold" style={{ color: cfg.cor }}>
                    R$ {((cfg.capital_inicial ?? 10000) / 1000).toFixed(0)}k
                  </td>
                  <td className="px-3 py-2 text-right font-semibold text-amber-400">
                    R$ {(cfg.stake_base ?? 1000).toLocaleString("pt-BR")}
                    {cfg.stake_dupla_score != null && (
                      <span className="ml-1 text-[9px] text-purple-400">/ {((cfg.stake_base ?? 1000) * 2 / 1000).toFixed(0)}k²</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right text-emerald-400 font-semibold">Livre</td>
                  <td className="px-3 py-2 text-right text-red-400">{(cfg.sl_pct * 100).toFixed(1)}%</td>
                  <td className="px-3 py-2 text-right text-emerald-400">{(cfg.tp_pct * 100).toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── Carteira View ─────────────────────────────────────────────────────────────

function CarteiraView({ wallet, cfg, onVender, onReset, onAtualizar, onSalvarBanco, autoTrade, setAutoTrade }:
  { wallet: SimWallet; cfg?: PerfilConfig; onVender: (s: string) => void; onReset: () => void; onAtualizar: () => Promise<void>; onSalvarBanco?: () => void; autoTrade: boolean; setAutoTrade: (v: boolean) => void }) {
  const [atualizando, setAtualizando] = useState(false);
  const handleAtualizar = async () => {
    setAtualizando(true);
    try { await onAtualizar(); } finally { setAtualizando(false); }
  };

  const positions = Object.values(wallet.positions);
  const pnl_posicoes  = positions.reduce((acc, p) => acc + (p.units * p.last_price_usd * p.last_usd_brl) - p.amount_brl, 0);
  const pnl_realizados = wallet.trades.filter(t => t.tipo === "V").reduce((a, t) => a + (t.pnl_brl ?? 0), 0);
  const pnl_total = pnl_posicoes + pnl_realizados;
  const pct_total = (pnl_total / wallet.saldo_inicial) * 100;
  const valor_posicoes = positions.reduce((acc, p) => acc + p.units * p.last_price_usd * p.last_usd_brl, 0);
  const saldo_total = wallet.saldo_livre + valor_posicoes;
  const vendas = wallet.trades.filter(t => t.tipo === "V");
  const win_rate = vendas.length > 0 ? (vendas.filter(t => (t.pnl_brl ?? 0) > 0).length / vendas.length) * 100 : null;

  // Emparelha compras com vendas para o relatorio
  const ops: Array<{
    n: number; simbolo: string; auto: boolean;
    compra: SimTrade; venda?: SimTrade;
    status: "lucro" | "prejuizo" | "aberto";
    pos?: SimPos;
    curr_val?: number;
  }> = [];
  const pending: Record<string, SimTrade> = {};
  let n = 0;
  for (const t of wallet.trades) {
    if (t.tipo === "C") { pending[t.simbolo] = t; }
    else {
      const buy = pending[t.simbolo];
      if (buy) {
        n++;
        ops.push({ n, simbolo: t.simbolo, auto: t.auto || buy.auto,
          compra: buy, venda: t, status: (t.pnl_brl ?? 0) >= 0 ? "lucro" : "prejuizo" });
        delete pending[t.simbolo];
      }
    }
  }
  for (const [sim, pos] of Object.entries(wallet.positions)) {
    const buy = pending[sim];
    if (buy) {
      n++;
      const curr_val = pos.units * pos.last_price_usd * pos.last_usd_brl;
      ops.push({ n, simbolo: sim, auto: buy.auto, compra: buy, status: "aberto", pos, curr_val });
    }
  }

  // Totais do relatorio
  const totalInvestido = ops.filter(o => o.venda).reduce((a, o) => a + o.compra.amount_brl, 0);
  const totalRetorno   = ops.filter(o => o.venda).reduce((a, o) => a + (o.venda!.amount_brl), 0);
  const totalPnl       = totalRetorno - totalInvestido;
  const totalTaxas     = ops.reduce((a, o) => a + (o.compra.fee ?? 0), 0);
  const melhor = ops.filter(o => o.venda).reduce((best, o) => (o.venda!.pnl_brl ?? 0) > (best?.venda?.pnl_brl ?? -Infinity) ? o : best, ops[0]);
  const pior   = ops.filter(o => o.venda).reduce((worst, o) => (o.venda!.pnl_brl ?? 0) < (worst?.venda?.pnl_brl ?? Infinity) ? o : worst, ops[0]);

  const fmtHora = (ms: number) => new Date(ms).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const fmtData = (ms: number) => new Date(ms).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2">
            {cfg && <span className="text-xl">{cfg.emoji}</span>}
            <div>
              <h2 className="text-lg font-black text-[var(--text-primary)]">
                {cfg ? `${cfg.nome} ${cfg.nivel}` : "Carteira Simulacao"}
              </h2>
              <p className="text-xs text-[var(--text-secondary)]">
                Iniciada {new Date(wallet.criado).toLocaleDateString("pt-BR")} • {ops.length} operacoes
                {cfg && ` • Stake R$ ${(cfg.stake_base ?? 1000).toLocaleString("pt-BR")} • SL ${(cfg.sl_pct * 100).toFixed(1)}% / TP ${(cfg.tp_pct * 100).toFixed(1)}% • Posicoes livres`}
              </p>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={handleAtualizar} disabled={atualizando}
            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] text-sm font-semibold text-[var(--text-secondary)] hover:border-blue-500/50 hover:text-blue-400 transition-all disabled:opacity-50">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
              className={atualizando ? "animate-spin" : ""}>
              <path d="M23 4v6h-6"/><path d="M1 20v-6h6"/>
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
            </svg>
            {atualizando ? "Atualizando..." : "Atualizar"}
          </button>
          <button onClick={() => setAutoTrade(!autoTrade)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-semibold transition-all ${
              autoTrade ? "bg-emerald-500/20 border-emerald-500 text-emerald-400" : "bg-[var(--bg-card)] border-[var(--border)] text-[var(--text-secondary)]"
            }`}>
            <span className={`w-2 h-2 rounded-full ${autoTrade ? "bg-emerald-400 animate-pulse" : "bg-gray-500"}`} />
            Auto Trade {autoTrade ? "ON" : "OFF"}
          </button>
          {onSalvarBanco && (
            <button onClick={onSalvarBanco}
              className="px-3 py-2 rounded-lg border border-blue-500/40 text-blue-400 text-xs font-semibold hover:bg-blue-500/10 transition-colors flex items-center gap-1.5">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>
              </svg>
              Salvar Banco
            </button>
          )}
          {ops.length > 0 && (
            <button onClick={() => exportarPDF(wallet, ops, totalInvestido, totalRetorno, totalPnl, totalTaxas, win_rate)}
              className="px-3 py-2 rounded-lg border border-blue-500/40 text-blue-400 text-xs font-semibold hover:bg-blue-500/10 transition-colors flex items-center gap-1.5">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
              Exportar PDF
            </button>
          )}
          <button onClick={onReset} className="px-3 py-2 rounded-lg border border-red-500/30 text-red-400 text-xs hover:bg-red-500/10 transition-colors">
            Zerar
          </button>
        </div>
      </div>

      {/* Aprendizado do perfil */}
      {cfg && (() => {
        const learn = learnInfo(wallet.trades, cfg.score_compra);
        const vendas = wallet.trades.filter(t => t.tipo === "V");
        if (vendas.length === 0) return null;
        return (
          <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl border text-xs"
            style={{ background: learn.cor + "10", borderColor: learn.cor + "30" }}>
            <span className="text-base">{learn.icon}</span>
            <div className="flex-1 min-w-0">
              <span className="font-bold" style={{ color: learn.cor }}>{learn.label}</span>
              <span className="text-[var(--text-secondary)] ml-2">
                Score base {cfg.score_compra}
                {learn.delta !== 0 && (
                  <> → <span className="font-bold" style={{ color: learn.cor }}>efetivo {learn.scoreEfetivo}</span></>
                )}
              </span>
            </div>
            <div className="text-[10px] text-[var(--text-secondary)] shrink-0">
              {vendas.slice(-15).length} ops analisadas
            </div>
          </div>
        );
      })()}

      {/* Stats cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Saldo Total",    val: `R$ ${fmt(saldo_total, 2)}`,   cor: "var(--text-primary)" },
          { label: "P&L Total",      val: `${pnl_total >= 0 ? "+" : ""}R$ ${fmt(Math.abs(pnl_total), 2)}`,
            cor: pnl_total >= 0 ? "#10b981" : "#ef4444", sub: `${pct_total >= 0 ? "+" : ""}${pct_total.toFixed(2)}%` },
          { label: "Disponivel",     val: `R$ ${fmt(wallet.saldo_livre, 2)}`, cor: "var(--text-primary)" },
          { label: "Taxa de Acerto", val: win_rate != null ? `${win_rate.toFixed(0)}%` : "—",
            cor: win_rate != null && win_rate >= 50 ? "#10b981" : "#ef4444", sub: `${vendas.length} encerradas` },
        ].map(({ label, val, cor, sub }) => (
          <div key={label} className="p-3 rounded-xl border border-[var(--border)] bg-[var(--bg-card)]">
            <div className="text-[10px] text-[var(--text-secondary)] mb-1">{label}</div>
            <div className="font-black text-base leading-tight" style={{ color: cor }}>{val}</div>
            {sub && <div className="text-[10px] font-semibold mt-0.5" style={{ color: cor }}>{sub}</div>}
          </div>
        ))}
      </div>

      {/* Posicoes Abertas */}
      {positions.length > 0 && (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] overflow-hidden">
          <div className="px-4 py-3 border-b border-[var(--border)] font-semibold text-sm text-[var(--text-primary)]">
            Posicoes Abertas ({positions.length})
          </div>
          <div className="divide-y divide-[var(--border)]">
            {positions.map(p => {
              const curr_brl = p.last_price_usd * p.last_usd_brl;
              const curr_val = p.units * curr_brl;
              const pnl = curr_val - p.amount_brl;
              const pct = (pnl / p.amount_brl) * 100;
              const dur = Math.floor((Date.now() - p.time) / 60000);
              const c = pnl >= 0 ? "text-emerald-400" : "text-red-400";
              return (
                <div key={p.simbolo} className="flex items-center gap-3 px-4 py-3">
                  <div className="text-xl">{COIN_ICONS[p.simbolo] ?? "O"}</div>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-[var(--text-primary)] text-sm">{p.simbolo}</div>
                    <div className="text-[10px] text-[var(--text-secondary)]">
                      Entrada R$ {fmt(p.price_brl, p.price_brl >= 1 ? 2 : 4)} • {dur < 60 ? `${dur}min` : `${Math.floor(dur/60)}h`} atras
                    </div>
                  </div>
                  <div className="text-center hidden sm:block">
                    <div className="text-[9px] text-[var(--text-secondary)]">Atual</div>
                    <div className="text-xs font-semibold">R$ {fmt(curr_brl, curr_brl >= 1 ? 2 : 4)}</div>
                  </div>
                  <div className="text-right min-w-[90px]">
                    <div className={`font-bold text-sm ${c}`}>{pnl >= 0 ? "+" : ""}R$ {fmt(Math.abs(pnl), 2)}</div>
                    <div className={`text-[10px] font-semibold ${c}`}>{pct >= 0 ? "+" : ""}{pct.toFixed(2)}%</div>
                  </div>
                  <button onClick={() => onVender(p.simbolo)}
                    className="px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-[10px] font-semibold hover:bg-red-500/20 transition-colors whitespace-nowrap">
                    Vender
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Relatorio Detalhado de Operacoes ─────────────────────── */}
      {ops.length > 0 && (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] overflow-hidden">
          {/* Relatorio header */}
          <div className="px-4 py-3 border-b border-[var(--border)] bg-[var(--bg)]">
            <div className="font-bold text-sm text-[var(--text-primary)]">Relatorio de Operacoes</div>
            <div className="text-[10px] text-[var(--text-secondary)] mt-0.5">
              {ops.filter(o => o.venda).length} encerradas • {ops.filter(o => !o.venda).length} em aberto
              {win_rate != null && ` • ${win_rate.toFixed(0)}% de acerto`}
            </div>
          </div>

          {/* Tabela */}
          <div className="overflow-x-auto">
            <table className="w-full" style={{ fontSize: "11px" }}>
              <thead>
                <tr className="border-b border-[var(--border)] text-[var(--text-secondary)] bg-[var(--bg)]">
                  <th className="text-center px-3 py-2.5 w-8">#</th>
                  <th className="text-left px-3 py-2.5">Moeda</th>
                  <th className="text-left px-3 py-2.5">Data/Hora Compra</th>
                  <th className="text-right px-3 py-2.5">Preco Compra</th>
                  <th className="text-right px-3 py-2.5">Investido</th>
                  <th className="text-right px-3 py-2.5 text-amber-400/80">Taxa (0,06%)</th>
                  <th className="text-left px-3 py-2.5">Data/Hora Venda</th>
                  <th className="text-right px-3 py-2.5">Preco Venda</th>
                  <th className="text-right px-3 py-2.5">Retorno</th>
                  <th className="text-right px-3 py-2.5">P&L</th>
                  <th className="text-right px-3 py-2.5">%</th>
                  <th className="text-center px-3 py-2.5">Resultado</th>
                </tr>
              </thead>
              <tbody>
                {ops.map(op => {
                  const closed = !!op.venda;
                  const pnl = op.venda?.pnl_brl;
                  const pct = op.venda?.pct;
                  const retorno = op.venda ? op.venda.amount_brl : (op.curr_val ?? op.compra.amount_brl);
                  const pnl_open = op.curr_val != null ? op.curr_val - op.compra.amount_brl : null;
                  const pct_open = pnl_open != null ? (pnl_open / op.compra.amount_brl) * 100 : null;
                  const lucro = closed ? (pnl ?? 0) >= 0 : (pnl_open ?? 0) >= 0;
                  const resultCor = op.status === "aberto" ? "text-amber-400" : lucro ? "text-emerald-400" : "text-red-400";
                  const resultBg  = op.status === "aberto" ? "bg-amber-500/10 border-amber-500/30" : lucro ? "bg-emerald-500/10 border-emerald-500/30" : "bg-red-500/10 border-red-500/30";
                  return (
                    <tr key={op.n}
                      className={`border-b border-[var(--border)]/40 hover:bg-[var(--bg)] transition-colors ${
                        op.status === "lucro" ? "bg-emerald-500/3" : op.status === "prejuizo" ? "bg-red-500/3" : ""
                      }`}>
                      {/* # */}
                      <td className="px-3 py-3 text-center text-[var(--text-secondary)] font-mono">{op.n}</td>
                      {/* Moeda */}
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-1.5">
                          <span className="text-base">{COIN_ICONS[op.simbolo] ?? "O"}</span>
                          <div>
                            <div className="font-bold text-[var(--text-primary)]">{op.simbolo}</div>
                            {op.auto && <span className="text-[8px] text-amber-400 border border-amber-400/40 px-1 rounded">AUTO</span>}
                          </div>
                        </div>
                      </td>
                      {/* Data Compra */}
                      <td className="px-3 py-3 whitespace-nowrap">
                        <div className="text-[var(--text-primary)] font-medium">{fmtHora(op.compra.time)}</div>
                        <div className="text-[var(--text-secondary)] text-[9px]">{fmtData(op.compra.time)}</div>
                      </td>
                      {/* Preco Compra */}
                      <td className="px-3 py-3 text-right font-mono">
                        <div className="text-[var(--text-primary)] font-semibold">R$ {fmt(op.compra.price_brl, op.compra.price_brl >= 1 ? 2 : 4)}</div>
                      </td>
                      {/* Investido */}
                      <td className="px-3 py-3 text-right font-mono">
                        <span className="text-[var(--text-secondary)]">R$ {fmt(op.compra.amount_brl, 2)}</span>
                      </td>
                      {/* Taxa */}
                      <td className="px-3 py-3 text-right font-mono">
                        <span className="text-amber-400 text-[10px] font-semibold">
                          {op.compra.fee != null ? `R$ ${fmt(op.compra.fee, 2)}` : "—"}
                        </span>
                      </td>
                      {/* Data Venda */}
                      <td className="px-3 py-3 whitespace-nowrap">
                        {op.venda ? (
                          <><div className="text-[var(--text-primary)] font-medium">{fmtHora(op.venda.time)}</div>
                          <div className="text-[var(--text-secondary)] text-[9px]">{fmtData(op.venda.time)}</div></>
                        ) : <span className="text-amber-400 text-[10px] font-semibold">Em aberto</span>}
                      </td>
                      {/* Preco Venda */}
                      <td className="px-3 py-3 text-right font-mono">
                        {op.venda ? (
                          <div className="font-semibold text-[var(--text-primary)]">R$ {fmt(op.venda.price_brl, op.venda.price_brl >= 1 ? 2 : 4)}</div>
                        ) : op.pos ? (
                          <div className="text-amber-400">R$ {fmt(op.pos.last_price_usd * op.pos.last_usd_brl, 2)}</div>
                        ) : <span className="text-[var(--text-secondary)]">—</span>}
                      </td>
                      {/* Retorno */}
                      <td className="px-3 py-3 text-right font-mono">
                        <span className={`font-semibold ${closed ? "text-[var(--text-primary)]" : "text-amber-400"}`}>
                          R$ {fmt(retorno, 2)}
                        </span>
                      </td>
                      {/* P&L */}
                      <td className="px-3 py-3 text-right font-mono font-bold">
                        {closed ? (
                          <span className={lucro ? "text-emerald-400" : "text-red-400"}>
                            {(pnl ?? 0) >= 0 ? "+" : ""}R$ {fmt(Math.abs(pnl ?? 0), 2)}
                          </span>
                        ) : pnl_open != null ? (
                          <span className={lucro ? "text-emerald-400/70" : "text-red-400/70"}>
                            {pnl_open >= 0 ? "+" : ""}R$ {fmt(Math.abs(pnl_open), 2)}
                          </span>
                        ) : <span className="text-[var(--text-secondary)]">—</span>}
                      </td>
                      {/* % */}
                      <td className="px-3 py-3 text-right font-semibold">
                        {closed && pct != null ? (
                          <span className={lucro ? "text-emerald-400" : "text-red-400"}>
                            {pct >= 0 ? "+" : ""}{pct.toFixed(2)}%
                          </span>
                        ) : pct_open != null ? (
                          <span className={lucro ? "text-emerald-400/70" : "text-red-400/70"}>
                            {pct_open >= 0 ? "+" : ""}{pct_open.toFixed(2)}%
                          </span>
                        ) : "—"}
                      </td>
                      {/* Resultado */}
                      <td className="px-3 py-3 text-center">
                        <span className={`px-2 py-1 rounded-lg text-[10px] font-bold border ${resultBg} ${resultCor}`}>
                          {op.status === "aberto" ? "EM ABERTO" : lucro ? "LUCRO" : "PREJUIZO"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Resumo financeiro abaixo da tabela */}
          {vendas.length > 0 && (
            <div className="px-4 py-4 border-t border-[var(--border)] bg-[var(--bg)]">
              <div className="text-[11px] font-bold text-[var(--text-secondary)] mb-3 uppercase tracking-wide">Resumo das Operacoes Encerradas</div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 rounded-lg bg-[var(--bg-card)] border border-[var(--border)]">
                  <div className="text-[9px] text-[var(--text-secondary)]">Total Investido</div>
                  <div className="font-black text-sm text-[var(--text-primary)]">R$ {fmt(totalInvestido, 2)}</div>
                </div>
                <div className="p-3 rounded-lg bg-[var(--bg-card)] border border-[var(--border)]">
                  <div className="text-[9px] text-[var(--text-secondary)]">Total Retornado</div>
                  <div className="font-black text-sm text-[var(--text-primary)]">R$ {fmt(totalRetorno, 2)}</div>
                </div>
                <div className={`p-3 rounded-lg border ${totalPnl >= 0 ? "bg-emerald-500/8 border-emerald-500/30" : "bg-red-500/8 border-red-500/30"}`}>
                  <div className="text-[9px] text-[var(--text-secondary)]">P&L Realizado</div>
                  <div className={`font-black text-sm ${totalPnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                    {totalPnl >= 0 ? "+" : ""}R$ {fmt(Math.abs(totalPnl), 2)}
                    <span className="text-[10px] ml-1 opacity-80">
                      ({totalInvestido > 0 ? ((totalPnl / totalInvestido) * 100).toFixed(2) : "0.00"}%)
                    </span>
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-amber-500/8 border border-amber-500/30">
                  <div className="text-[9px] text-[var(--text-secondary)]">Total em Taxas (0,06%)</div>
                  <div className="font-black text-sm text-amber-400">R$ {fmt(totalTaxas, 2)}</div>
                  <div className="text-[9px] text-amber-400/70">{ops.filter(o => o.compra.fee).length} compras</div>
                </div>
              </div>
              {(melhor?.venda || pior?.venda) && (
                <div className="mt-3 grid grid-cols-2 gap-3">
                  {melhor?.venda && (
                    <div className="p-2.5 rounded-lg bg-emerald-500/8 border border-emerald-500/20">
                      <div className="text-[9px] text-[var(--text-secondary)]">Melhor Operacao</div>
                      <div className="text-[10px] text-emerald-400 font-semibold">+R$ {fmt(Math.abs(melhor.venda.pnl_brl ?? 0), 2)} · {melhor.simbolo}</div>
                    </div>
                  )}
                  {pior?.venda && pior.simbolo !== melhor?.simbolo && (
                    <div className="p-2.5 rounded-lg bg-red-500/8 border border-red-500/20">
                      <div className="text-[9px] text-[var(--text-secondary)]">Pior Operacao</div>
                      <div className="text-[10px] text-red-400 font-semibold">{(pior.venda.pnl_brl ?? 0) >= 0 ? "+" : ""}R$ {fmt(pior.venda.pnl_brl ?? 0, 2)} · {pior.simbolo}</div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {ops.length === 0 && (
        <div className="text-center py-12 text-[var(--text-secondary)] text-sm">
          Nenhuma operacao ainda.{" "}
          {autoTrade ? "Auto trade ativo — aguardando sinais de compra." : "Ative o Auto Trade ou compre manualmente no Ranking."}
        </div>
      )}
    </div>
  );
}


export default function DayTradePage() {
  const [selected, setSelected]       = useState<string | null>(null);
  const [view, setView]               = useState<"ranking" | "carteiras" | "comparativo" | "banco">("ranking");
  const [autoTrade, setAutoTrade]     = useState(true);
  const [activePerfilId, setActivePerfilId] = useState("mod_normal");
  const [infoPerfilId, setInfoPerfilId]     = useState<string | null>(null);

  const { wallets, comprarPerfil, venderPerfil, atualizarTodos, resetPerfil, resetAll } = useMultiWallet();
  const { banco, salvar: salvarBanco, remover: removerBanco, removerData } = useBanco();

  // Ref para acessar wallets sem stale closure no interval
  const walletsRef = useRef(wallets);
  useEffect(() => { walletsRef.current = wallets; }, [wallets]);

  const activeCfg    = PERFIS.find(p => p.id === activePerfilId)!;
  const activeWallet = wallets[activePerfilId] ?? emptyWallet();

  // Para RankingView e DetailView — usa carteira do perfil ativo
  const handleBuy = useCallback((item: ScanItem, usd_brl: number) => {
    comprarPerfil(activePerfilId, item.simbolo, item.preco, usd_brl, item.score, false);
  }, [comprarPerfil, activePerfilId]);

  const handleBuyDetail = useCallback((price: number, usd_brl: number, score: number) => {
    if (selected) comprarPerfil(activePerfilId, selected, price, usd_brl, score, false);
  }, [comprarPerfil, activePerfilId, selected]);

  const handleSellDetail = useCallback((price: number, usd_brl: number, score: number) => {
    if (selected) venderPerfil(activePerfilId, selected, price, usd_brl, score, false, "Venda manual");
  }, [venderPerfil, activePerfilId, selected]);

  const handleSellCarteira = useCallback((simbolo: string) => {
    const pos = activeWallet.positions[simbolo];
    if (pos) venderPerfil(activePerfilId, simbolo, pos.last_price_usd, pos.last_usd_brl, 0, false, "Venda manual");
  }, [venderPerfil, activePerfilId, activeWallet.positions]);

  // Auto-trade: cada perfil opera com suas proprias regras
  useEffect(() => {
    if (!autoTrade) return;
    const run = async () => {
      try {
        const d: ScanData = await fetch(`${API}/cripto/daytrade/scan`).then(r => r.json());
        const usd_brl = d.usd_brl ?? 5.2;
        atualizarTodos(d.geral);
        const snap = walletsRef.current;
        for (const cfg of PERFIS) {
          const w = snap[cfg.id];
          if (!w) continue;
          // Aprendizado: score efetivo ajustado pelo histórico do perfil
          const learnDelta = computeLearnDelta(w.trades);
          const scoreMinEfetivo = Math.min(Math.max(cfg.score_compra + learnDelta, 10), 95);

          // 1) Checar SL / TP / score_venda das posicoes abertas
          for (const [sym, pos] of Object.entries(w.positions)) {
            const it = d.geral.find(i => i.simbolo === sym);
            if (!it) continue;
            const curr_brl = it.preco * usd_brl;
            if (pos.stop_loss_price && curr_brl <= pos.stop_loss_price) {
              venderPerfil(cfg.id, sym, it.preco, usd_brl, it.score, true, `Stop Loss ${(cfg.sl_pct*100).toFixed(1)}% atingido`);
            } else if (pos.take_profit_price && curr_brl >= pos.take_profit_price) {
              venderPerfil(cfg.id, sym, it.preco, usd_brl, it.score, true, `Take Profit ${(cfg.tp_pct*100).toFixed(1)}% atingido`);
            } else if (!it.bullish && it.score < cfg.score_venda) {
              // Saída por sinal bearish — score caiu abaixo do threshold de venda
              venderPerfil(cfg.id, sym, it.preco, usd_brl, it.score, true, `Sinal bearish — score ${it.score} < ${cfg.score_venda}`);
            }
          }
          // 2) Novas entradas (com score ajustado pelo aprendizado)
          for (const it of d.geral) {
            const scoreDentroFaixa = it.score >= scoreMinEfetivo && it.score <= (cfg.score_max_compra ?? 100);
            const bullOk = (it.bull_pct ?? 50) >= cfg.bull_pct_min;
            let sinalOk: boolean;
            if (cfg.apenas_aguardar) {
              // Perfis Subida: só entra em AGUARDAR (operar=false) com bullish e score na faixa
              sinalOk = !it.operar && it.bullish && scoreDentroFaixa && bullOk;
            } else if (cfg.aguardar_ok) {
              // Perfis permissivos: entra em AGUARDAR e COMPRAR
              sinalOk = it.bullish && scoreDentroFaixa && bullOk;
            } else {
              // Perfis conservadores: só entra em COMPRAR
              sinalOk = it.operar && it.bullish && scoreDentroFaixa && bullOk;
            }
            if (sinalOk) comprarPerfil(cfg.id, it.simbolo, it.preco, usd_brl, it.score, true);
          }
        }
      } catch {}
    };
    run();
    const id = setInterval(run, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, [autoTrade, comprarPerfil, venderPerfil, atualizarTodos]);

  const handleSalvarTodos = useCallback(() => {
    const entries = PERFIS.map(cfg => walletToEntry(cfg, wallets[cfg.id] ?? emptyWallet(cfg.capital_inicial)));
    salvarBanco(entries);
  }, [wallets, salvarBanco]);

  const handleSalvarAtivo = useCallback(() => {
    const entry = walletToEntry(activeCfg, activeWallet);
    salvarBanco([entry]);
  }, [activeCfg, activeWallet, salvarBanco]);

  const handleAtualizar = useCallback(async () => {
    try {
      const d: ScanData = await fetch(`${API}/cripto/daytrade/scan`).then(r => r.json());
      const usd_brl = d.usd_brl ?? 5.2;
      atualizarTodos(d.geral);
      const snap = walletsRef.current;
      for (const cfg of PERFIS) {
        const w = snap[cfg.id];
        if (!w) continue;
        for (const [sym, pos] of Object.entries(w.positions)) {
          const it = d.geral.find(i => i.simbolo === sym);
          if (!it) continue;
          const curr_brl = it.preco * usd_brl;
          if (pos.stop_loss_price && curr_brl <= pos.stop_loss_price)
            venderPerfil(cfg.id, sym, it.preco, usd_brl, it.score, true, `Stop Loss ${(cfg.sl_pct*100).toFixed(1)}% atingido`);
          else if (pos.take_profit_price && curr_brl >= pos.take_profit_price)
            venderPerfil(cfg.id, sym, it.preco, usd_brl, it.score, true, `Take Profit ${(cfg.tp_pct*100).toFixed(1)}% atingido`);
        }
      }
    } catch {}
  }, [atualizarTodos, venderPerfil]);

  // Total posicoes abertas em todas as carteiras
  const totalPos = Object.values(wallets).reduce((a, w) => a + Object.keys(w.positions).length, 0);

  const TAB_BTN = (v: typeof view, label: string, badge?: number) => (
    <button onClick={() => setView(v)}
      className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all border ${
        view === v ? "bg-emerald-500 text-white border-emerald-500" : "bg-[var(--bg-card)] border-[var(--border)] text-[var(--text-secondary)] hover:border-emerald-500/40"
      }`}>
      {label}
      {badge != null && badge > 0 && (
        <span className="w-5 h-5 rounded-full bg-emerald-500 text-white text-[10px] font-black flex items-center justify-center">
          {badge}
        </span>
      )}
      {v === "carteiras" && autoTrade && <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />}
    </button>
  );

  const infoPerfilCfg = infoPerfilId ? PERFIS.find(p => p.id === infoPerfilId) : null;

  return (
    <div className="max-w-7xl mx-auto px-4 pb-12">
      {infoPerfilCfg && (
        <PerfilInfoModal cfg={infoPerfilCfg} onClose={() => setInfoPerfilId(null)} />
      )}
      {!selected && (
        <div className="flex gap-2 mb-4 pt-2 flex-wrap">
          {TAB_BTN("ranking", "Ranking")}
          {TAB_BTN("carteiras", "Carteiras", totalPos)}
          {TAB_BTN("comparativo", "Comparativo")}
          {TAB_BTN("banco", "Banco", banco.length > 0 ? undefined : undefined)}
        </div>
      )}

      {selected ? (
        <DetailView simbolo={selected} onBack={() => setSelected(null)}
          wallet={activeWallet} onBuy={handleBuyDetail} onSell={handleSellDetail} />
      ) : view === "banco" ? (
        <BancoView banco={banco} wallets={wallets} onSalvarTodos={handleSalvarTodos} onRemoverData={removerData} />
      ) : view === "comparativo" ? (
        <ComparativoView wallets={wallets} onSelect={(id) => { setActivePerfilId(id); setView("carteiras"); }} onResetAll={resetAll} onInfo={setInfoPerfilId} />
      ) : view === "carteiras" ? (
        <div className="space-y-4">
          {/* Seletor de perfil */}
          <div className="grid grid-cols-3 gap-2">
            {PERFIS.map(cfg => {
              const w = wallets[cfg.id] ?? emptyWallet();
              const pos_n = Object.keys(w.positions).length;
              const cap = w.saldo_livre + Object.values(w.positions).reduce((a, p) => a + p.units * p.last_price_usd * p.last_usd_brl, 0);
              const roi = ((cap - w.saldo_inicial) / w.saldo_inicial) * 100;
              const active = cfg.id === activePerfilId;
              return (
                <div key={cfg.id}
                  className={`rounded-xl border transition-all ${active
                    ? "bg-[var(--bg-card)] shadow-sm"
                    : "border-[var(--border)] bg-[var(--bg)]"}`}
                  style={active ? { borderColor: cfg.cor, borderWidth: "1.5px" } : {}}>
                  {/* Linha superior: seleciona + info */}
                  <button onClick={() => setActivePerfilId(cfg.id)}
                    className="w-full p-2.5 pb-1.5 text-left">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm">{cfg.emoji}</span>
                      <span className="text-[10px] font-bold text-[var(--text-primary)] truncate">{cfg.nome}</span>
                      <span className="text-[9px] ml-auto" style={{ color: cfg.cor }}>{cfg.nivel}</span>
                    </div>
                  </button>
                  <div className="flex items-center justify-between px-2.5 pb-2.5">
                    <button onClick={() => setActivePerfilId(cfg.id)}
                      className={`text-xs font-black ${roi >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                      {roi >= 0 ? "+" : ""}{roi.toFixed(2)}%
                    </button>
                    <div className="flex items-center gap-1">
                      {cfg.apenas_aguardar && (
                        <span className="text-[8px] px-1 rounded font-bold" style={{ background: cfg.cor + "20", color: cfg.cor }}>
                          AGU
                        </span>
                      )}
                      {cfg.stake_dupla_score != null && (
                        <span className="text-[8px] px-1 rounded font-bold" style={{ background: cfg.cor + "20", color: cfg.cor }}>
                          2×
                        </span>
                      )}
                      {pos_n > 0 && (
                        <span className="text-[9px] bg-amber-400/15 text-amber-400 px-1 rounded font-bold">{pos_n}</span>
                      )}
                      <button
                        onClick={() => setInfoPerfilId(cfg.id)}
                        title="Ver caracteristicas"
                        className="w-5 h-5 rounded-full border border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--border-hover)] hover:text-[var(--text-primary)] transition-colors flex items-center justify-center text-[10px] font-bold">
                        i
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          {/* Carteira do perfil selecionado */}
          <CarteiraView
            wallet={activeWallet}
            cfg={activeCfg}
            onVender={handleSellCarteira}
            onReset={() => resetPerfil(activePerfilId)}
            onAtualizar={handleAtualizar}
            onSalvarBanco={handleSalvarAtivo}
            autoTrade={autoTrade}
            setAutoTrade={setAutoTrade}
          />
        </div>
      ) : (
        <RankingView onSelect={setSelected} wallet={activeWallet} onBuy={handleBuy}
          onScanUpdate={atualizarTodos} />
      )}
    </div>
  );
}
