import type { AlphaFullPortfolio, ComposicaoIndice, EmpresaB3, FundamentosData, PontoHistorico, QuoteData, RSAnalisaData, SimuladorData, ValuationData } from "@/types";

// ── Tipos de chat ─────────────────────────────────────────────────────────────
export interface MensagemChat {
  papel: "usuario" | "assistente";
  conteudo: string;
}

export interface AIStatusResponse {
  disponivel: boolean;
  modo: "openai" | "static";
  modelo: string | null;
}

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1";

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { next: { revalidate: 60 } });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail ?? `Erro HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export async function getCotacao(ticker: string): Promise<QuoteData> {
  return fetchJson<QuoteData>(`${BASE}/cotacao/${ticker}`);
}

export async function getHistorico(
  ticker: string,
  range = "5y",
  interval = "1mo"
): Promise<PontoHistorico[]> {
  return fetchJson<PontoHistorico[]>(
    `${BASE}/historico/${ticker}?range=${range}&interval=${interval}`
  );
}

export async function getFundamentos(ticker: string): Promise<FundamentosData> {
  return fetchJson<FundamentosData>(`${BASE}/fundamentos/${ticker}`);
}

export async function getValuation(ticker: string): Promise<ValuationData> {
  return fetchJson<ValuationData>(`${BASE}/valuation/${ticker}`);
}

export async function getMercado(tipo?: "acoes" | "fiis", tickers?: string[]): Promise<QuoteData[]> {
  const params = new URLSearchParams();
  if (tipo) params.set("tipo", tipo);
  if (tickers?.length) params.set("tickers", tickers.join(","));
  const query = params.toString() ? `?${params}` : "";
  return fetchJson<QuoteData[]>(`${BASE}/mercado${query}`);
}

export async function getEmpresaB3(ticker: string): Promise<EmpresaB3> {
  return fetchJson<EmpresaB3>(`${BASE}/b3/empresa/${ticker}`);
}

export async function getIndicesDoTicker(ticker: string): Promise<{ ticker: string; indices: string[] }> {
  return fetchJson<{ ticker: string; indices: string[] }>(`${BASE}/b3/indices-do-ticker/${ticker}`);
}

export async function getComposicaoIndice(codigo: string): Promise<{ indice: string; total_ativos: number; composicao: ComposicaoIndice[] }> {
  return fetchJson<{ indice: string; total_ativos: number; composicao: ComposicaoIndice[] }>(`${BASE}/b3/indice/${codigo}`);
}

export async function getAlphaStock(symbol: string): Promise<AlphaFullPortfolio> {
  return fetchJson<AlphaFullPortfolio>(`${BASE}/alpha/stock/${symbol}`);
}

export async function getRSAnalisa(ticker: string): Promise<RSAnalisaData> {
  return fetchJson<RSAnalisaData>(`${BASE}/rs-analisa/${ticker}`);
}

export interface SimuladorPayload {
  ticker: string;
  data_compra: string;
  data_venda?: string | null;
  quantidade: number;
  corretagem?: number;
  dividendos_recebidos?: number;
  jcp_recebido?: number;
  // preco_compra removido — buscado automaticamente do histórico B3
}

// ── AI Chat — Analista Particular ─────────────────────────────────────────────

// ── AI Comparador — Feature 2 ─────────────────────────────────────────────────

export type PerfilComparacao = "dividendos" | "crescimento" | "equilibrio";

export interface VencedoresDimensoes {
  lucros:       string;
  crescimento:  string;
  saude:        string;
  valuation:    string;
  dividendos:   string;
  governanca:   string;
  momentum:     string;
  eficiencia:   string;
}

export interface ScoreTicker {
  score_total:   number | null;
  nota_geral:    string | null;
  lucros:        number | null;
  crescimento:   number | null;
  saude:         number | null;
  valuation_pts: number | null;
  dividendos:    number | null;
  governanca:    number | null;
  momentum:      number | null;
  eficiencia:    number | null;
}

export interface ComparativoResult {
  tickers:                   string[];
  perfil:                    PerfilComparacao;
  vencedor_geral:            string;
  vencedores_dimensoes:      VencedoresDimensoes;
  narrativa:                 string;
  recomendacao_dividendos:   string;
  recomendacao_crescimento:  string;
  recomendacao_equilibrio:   string;
  scores_por_ticker:         Record<string, ScoreTicker>;
  aviso:                     string;
}

export async function postCompare(
  ativos: Array<{ ticker: string; dados: RSAnalisaData }>,
  perfil: PerfilComparacao,
): Promise<ComparativoResult> {
  const res = await fetch(`${BASE}/ai/compare`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ativos, perfil }),
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const detail = body.detail;
    if (res.status === 503 && typeof detail === "object" && detail?.modo === "static") {
      throw Object.assign(new Error("static_fallback"), { isStaticFallback: true });
    }
    throw new Error(typeof detail === "string" ? detail : `Erro HTTP ${res.status}`);
  }
  return res.json() as Promise<ComparativoResult>;
}

// ── AI Radar de Anomalias — Feature 3 ────────────────────────────────────────

export interface SinalRadar {
  indicador:       string;
  nome:            string;
  valor_atual:     number | null;
  ano_atual:       number | null;
  media_historica: number | null;
  desvio_padrao:   number | null;
  z_score:         number | null;
  severidade:      "critico" | "atencao" | "info";
  tipo:            "positivo" | "negativo";
  contexto:        string;
  melhor_quando:   string;
  historico_serie: Array<{ ano: number; valor: number }>;
}

export interface RadarResult {
  ticker:                      string;
  empresa:                     string;
  total_sinais:                number;
  total_criticos:              number;
  total_atencao:               number;
  total_info:                  number;
  sinais:                      SinalRadar[];
  resumo_geral:                string;
  narrativa_detalhada:         string;
  principais_riscos:           string[];
  pontos_positivos:            string[];
  recomendacao_acompanhamento: string;
  aviso:                       string;
  ia_disponivel:               boolean;
}

export async function postRadar(
  ticker: string,
  dadosAtivo: RSAnalisaData,
): Promise<RadarResult> {
  const res = await fetch(`${BASE}/ai/radar/${ticker}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ dados_ativo: dadosAtivo }),
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail ?? `Erro HTTP ${res.status}`);
  }
  return res.json() as Promise<RadarResult>;
}

// ── AI Documentos CVM — Feature 4 ────────────────────────────────────────────

export interface DocumentoCVM {
  id_doc:           string;
  ticker:           string;
  categoria:        string;
  tipo:             string;
  descricao:        string;
  data_recebimento: string;
  data_referencia:  string;
  link:             string | null;
  empresa:          string;
  resumo_executivo: string | null;
  sentimento:       "positivo" | "neutro" | "negativo" | null;
  topicos:          string[];
  impacto_esperado: string | null;
}

export interface DocumentosResult {
  ticker:        string;
  empresa:       string;
  total:         number;
  documentos:    DocumentoCVM[];
  ia_disponivel: boolean;
  aviso:         string;
}

export async function postDocumentos(
  ticker: string,
  empresa: string,
  dadosAtivo?: RSAnalisaData,
  limite = 10,
  anos = 2,
  comResumo = true,
): Promise<DocumentosResult> {
  const res = await fetch(`${BASE}/ai/documentos/${ticker}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      empresa,
      dados_ativo: dadosAtivo ?? null,
      limite,
      anos,
      com_resumo: comResumo,
    }),
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail ?? `Erro HTTP ${res.status}`);
  }
  return res.json() as Promise<DocumentosResult>;
}

export async function getAIStatus(): Promise<AIStatusResponse> {
  return fetchJson<AIStatusResponse>(`${BASE}/ai/chat/status`);
}

// ── Ranking Inteligente ───────────────────────────────────────────────────────

export interface EmpresaRanking {
  posicao:            number;
  medalha:            "ouro" | "prata" | "bronze" | null;
  ticker:             string;
  empresa:            string;
  setor:              string;
  score:              number;
  cotacao:            number | null;
  upside:             number | null;
  bullets_positivos:  string[];
  bullets_negativos:  string[];
  indicadores: {
    roe?:               number | null;
    margem_liquida?:    number | null;
    margem_ebitda?:     number | null;
    dl_ebitda?:         number | null;
    liquidez_corrente?: number | null;
    cagr_receita?:      number | null;
    cagr_lucro?:        number | null;
    upside?:            number | null;
  };
}

export interface CategoriaRanking {
  id:       string;
  nome:     string;
  icone:    string;
  cor:      string;
  grupo:    string;
  empresas: EmpresaRanking[];
}

export interface RankingData {
  categorias:          CategoriaRanking[];
  total_empresas:      number;
  ultima_atualizacao:  string;
  status:              "completo" | "parcial";
}

export async function getRanking(force = false): Promise<RankingData> {
  const url = `${BASE}/ranking${force ? "?force=true" : ""}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Erro HTTP ${res.status}`);
  return res.json() as Promise<RankingData>;
}

export async function getRankingStatus(): Promise<{
  cached: boolean; computing: boolean; age_s: number | null; ttl_s: number; tickers: number;
}> {
  return fetchJson(`${BASE}/ranking/status`);
}

/**
 * Retorna um AsyncGenerator que emite tokens do stream SSE.
 * Uso:
 *   for await (const token of streamIAChat(ticker, msgs, dados)) { ... }
 */
export async function* streamIAChat(
  ticker: string,
  mensagens: MensagemChat[],
  dadosAtivo: RSAnalisaData,
): AsyncGenerator<string> {
  const response = await fetch(`${BASE}/ai/chat/${ticker}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mensagens, dados_ativo: dadosAtivo }),
    cache: "no-store",
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const detail = body.detail;
    // 503 = sem chave OpenAI → modo static
    if (response.status === 503 && typeof detail === "object" && detail?.modo === "static") {
      throw Object.assign(new Error("static_fallback"), { isStaticFallback: true });
    }
    throw new Error(
      typeof detail === "string" ? detail : `Erro HTTP ${response.status}`,
    );
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error("Stream indisponível");

  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const raw = line.slice(6).trim();
        if (raw === "[DONE]") return;
        try {
          const parsed: { tipo: string; conteudo?: string; mensagem?: string } = JSON.parse(raw);
          if (parsed.tipo === "token" && parsed.conteudo) {
            yield parsed.conteudo;
          }
          if (parsed.tipo === "erro") {
            throw new Error(parsed.mensagem ?? "Erro no stream");
          }
        } catch (e) {
          if (e instanceof Error && e.message !== "Erro no stream") continue; // linha malformada
          throw e;
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

export async function postSimulador(payload: SimuladorPayload): Promise<SimuladorData> {
  const res = await fetch(`${BASE}/simulador`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail ?? `Erro HTTP ${res.status}`);
  }
  return res.json() as Promise<SimuladorData>;
}
