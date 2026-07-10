/** Demonstrativo financeiro de um exercício anual (espelha DemonstrativoAnual). */
export interface DemonstrativoAnual {
  ano: number;
  receita_liquida: number | null;
  lucro_bruto: number | null;
  ebit: number | null;
  ebitda: number | null;
  lucro_liquido: number | null;
  ativo_total: number | null;
  ativo_circulante: number | null;
  caixa: number | null;
  passivo_circulante: number | null;
  passivo_nao_circulante: number | null;
  patrimonio_liquido: number | null;
  fco: number | null;
  fci: number | null;
  fcl: number | null;
  margem_bruta: number | null;
  margem_ebit: number | null;
  margem_ebitda: number | null;
  margem_liquida: number | null;
  roe: number | null;
  liquidez_corrente: number | null;
  divida_liquida_estimada: number | null;
  dl_ebitda: number | null;
}

/** Indicador com sinal comparativo à média histórica. */
export interface IndicadorComSinal {
  valor: number | null;
  media_historica: number | null;
  sinal: "verde" | "amarelo" | "vermelho" | "neutro";
  melhor_quando: "maior" | "menor";
}

/** Resposta do endpoint /fundamentos/{ticker}. */
export interface FundamentosData {
  ticker: string;
  cd_cvm: string | null;
  fonte: string;
  historico: DemonstrativoAnual[];
  pl_atual: number | null;
  pvp_atual: number | null;
  ev_ebitda_atual: number | null;
  dy_atual: number | null;
  cagr_receita: number | null;
  cagr_lucro: number | null;
  cagr_pl: number | null;
  sinais: Record<string, IndicadorComSinal>;
}

/** Resultado de um método de valuation individual. */
export interface MetodoValuation {
  nome: string;
  descricao: string;
  preco_justo: number | null;
  upside_pct: number | null;
}

/** Projeção de preço justo em um cenário (Pessimista/Base/Otimista). */
export interface CenarioValuation {
  nome: string;
  taxa_crescimento: number;
  taxa_desconto: number;
  preco_justo: number | null;
  upside_pct: number | null;
}

/** Resposta completa do endpoint /valuation/{ticker}. */
export interface ValuationData {
  ticker: string;
  preco_atual: number;
  shares: number | null;
  eps: number | null;
  bvs: number | null;
  fcl_por_acao: number | null;
  metodos: MetodoValuation[];
  cenarios: CenarioValuation[];
  preco_justo_base: number | null;
  upside_pct: number | null;
  margem_seguranca: number | null;
  veredicto: string;
  veredicto_cor: "verde" | "amarelo" | "vermelho" | "neutro";
  premissas: Record<string, number | string | null>;
}

/** Cotação atual de um ativo (espelha QuoteData do backend). */
export interface QuoteData {
  ticker: string;
  nome_curto: string;
  nome_longo: string;
  preco_atual: number;
  variacao: number;
  variacao_pct: number;
  preco_abertura: number;
  preco_max: number;
  preco_min: number;
  preco_fechamento_anterior: number;
  volume: number;
  market_cap: number | null;
  moeda: string;
  logo_url: string | null;
  timestamp: string;
  preco_lucro: number | null;
  lpa: number | null;
  cinquenta_dois_semanas_alta: number | null;
  cinquenta_dois_semanas_baixa: number | null;
  setor: string | null;
  subsetor: string | null;
}

/** Dados cadastrais da empresa direto da B3. */
export interface EmpresaB3 {
  codeCVM: string;
  companyName: string;
  tradingName: string;
  cnpj: string;
  status: string;
  segment: string;
  market: string;
  typeBDR: string;
  dateListing: string;
  industryClassification: string | null;
  activity: string | null;
  website: string | null;
  otherCodes: { code: string; isin: string }[];
}

/** Um item da composição de um índice B3. */
export interface ComposicaoIndice {
  ticker: string;
  descricao: string;
  peso_pct: number;
  qtd_teorica: number | null;
}

/** Um ponto diário da Alpha Vantage (preços já convertidos em BRL). */
export interface AlphaDailyPoint {
  data: string;
  abertura: number;
  maximo: number;
  minimo: number;
  fechamento: number;
  fechamento_ajustado: number;
  volume: number;
  dividendo: number;
  split_coef: number;
  sma7:  number | null;
  sma21: number | null;
  sma50: number | null;
}

/** Fundamentos da empresa via Alpha Vantage OVERVIEW (valores monetários em BRL). */
export interface AlphaOverview {
  nome: string;
  descricao: string;
  exchange: string;
  pais: string;
  setor: string;
  industria: string;
  website: string | null;
  // Mercado
  market_cap_brl: number | null;
  shares_outstanding: number | null;
  // Valuation
  pe_trailing: number | null;
  pe_forward: number | null;
  peg_ratio: number | null;
  price_to_book: number | null;
  price_to_sales: number | null;
  ev_to_ebitda: number | null;
  ev_to_revenue: number | null;
  // Resultados em BRL
  receita_ttm_brl: number | null;
  lucro_bruto_ttm_brl: number | null;
  ebitda_brl: number | null;
  eps_brl: number | null;
  eps_diluido_brl: number | null;
  book_value_brl: number | null;
  receita_por_acao_brl: number | null;
  // Margens e retornos (%)
  margem_lucro: number | null;
  margem_operacional: number | null;
  roe: number | null;
  roa: number | null;
  // Crescimento (%)
  crescimento_lucro_tri: number | null;
  crescimento_receita_tri: number | null;
  // Dividendos
  dividendo_por_acao_brl: number | null;
  dividend_yield_pct: number | null;
  data_ex_dividendo: string | null;
  data_pagamento: string | null;
  // Técnico
  beta: number | null;
  alta_52s_brl: number | null;
  baixa_52s_brl: number | null;
  sma50_brl: number | null;
  sma200_brl: number | null;
  // Analistas
  preco_alvo_brl: number | null;
  analistas_compra_forte: number | null;
  analistas_compra: number | null;
  analistas_neutro: number | null;
  analistas_venda: number | null;
  analistas_venda_forte: number | null;
}

/** EPS trimestral reportado vs estimativa (em BRL). */
export interface AlphaEarnings {
  data_fiscal: string;
  data_relatorio: string | null;
  eps_reportado_brl: number | null;
  eps_estimado_brl: number | null;
  surpresa_brl: number | null;
  surpresa_pct: number | null;
  bateu_estimativa: boolean | null;
}

/** Portfólio completo Alpha Vantage — todos os valores em BRL. */
export interface AlphaFullPortfolio {
  symbol: string;
  usd_brl: number;
  data_cotacao: string;
  // Cotação atual em BRL
  preco_brl: number;
  abertura_brl: number;
  maximo_brl: number;
  minimo_brl: number;
  fechamento_anterior_brl: number;
  variacao_brl: number;
  variacao_pct: number;
  volume: number;
  // Overview completo
  overview: AlphaOverview;
  // Histórico (90 dias, em BRL)
  series: AlphaDailyPoint[];
  sma7_brl: number;
  sma21_brl: number;
  sma50_brl: number | null;
  // Earnings trimestrais
  earnings: AlphaEarnings[];
  // Análise automática
  tendencia: "alta" | "baixa" | "lateral";
  score: number;
  insights: string[];
}

/** @deprecated use AlphaFullPortfolio */
export type AlphaPortfolio = AlphaFullPortfolio;

// ── RS Analisa ────────────────────────────────────────────────────────────────

export interface RSScore {
  score_total: number;     // 0-1000
  nota_geral: string;      // Excelente | Muito Bom | Bom | Regular | Fraco
  lucros: number;          // 0-150
  crescimento: number;     // 0-150
  saude: number;           // 0-150
  valuation_pts: number;   // 0-150
  dividendos: number;      // 0-100
  governanca: number;      // 0-100
  momentum: number;        // 0-100
  eficiencia: number;      // 0-100
  pontos_fortes: string[];
  pontos_fracos: string[];
}

export interface RSAlerta {
  tipo: "critico" | "atencao" | "positivo" | "info";
  titulo: string;
  descricao: string;
  categoria: string;
}

export interface RSAnaliseIA {
  resumo_executivo: string;
  situacao_financeira: string;
  qualidade_lucros: string;
  crescimento: string;
  endividamento: string;
  dividendos: string;
  perspectivas: string;
  riscos: string[];
  pontos_fortes: string[];
  pontos_fracos: string[];
}

export interface RSHistoricoPonto {
  data: string;
  fechamento: number;
  abertura: number;
  maximo: number;
  minimo: number;
  volume: number;
}

export interface RSAnalisaData {
  ticker: string;
  timestamp: string;
  // Tipo de ativo
  is_fii: boolean;
  fii_tipo: string | null;
  fii_descricao: string | null;
  empresa: string;
  setor: string | null;
  subsetor: string | null;
  segmento_b3: string | null;
  governanca: string | null;
  cnpj: string | null;
  website: string | null;
  data_listagem: string | null;
  indices: string[];
  cotacao: QuoteData;
  var_mes: number | null;
  var_ano: number | null;
  historico_mensal: RSHistoricoPonto[];
  score: RSScore;
  fundamentos: FundamentosData | null;
  valuation: ValuationData | null;
  alertas: RSAlerta[];
  analise: RSAnaliseIA;
}

// ── Simulador de Investimentos ────────────────────────────────────────────────

export interface PontoTimeline {
  mes: string;
  data: string;
  preco: number;
  patrimonio: number;
  lucro_acumulado: number;
  rentabilidade_pct: number;
}

export interface ResumoSimulacao {
  ticker: string;
  empresa: string;
  // Compra
  data_compra: string;
  preco_compra: number;
  preco_compra_data_usada: string;   // fechamento histórico usado como referência
  quantidade: number;
  valor_investido: number;
  corretagem: number;
  // Saída
  data_saida: string;
  preco_saida: number;
  preco_saida_data_usada: string;
  posicao_aberta: boolean;
  valor_bruto: number;
  // Resultados
  lucro_acao: number;
  dividendos_recebidos: number;
  jcp_recebido: number;
  yield_total_pct: number;
  lucro_total: number;
  imposto_estimado: number;
  resultado_final: number;
  // Rentabilidade
  rentabilidade_pct: number;
  rentabilidade_anual_pct: number;
  // Período
  periodo_dias: number;
  periodo_anos: number;
}

export interface SimuladorData {
  resumo: ResumoSimulacao;
  timeline: PontoTimeline[];
  serie_preco: Array<{ data: string; preco: number; referencia?: string | null }>;
  serie_patrimonio: Array<{ data: string; patrimonio: number; lucro: number; investido: number }>;
  aviso?: string | null;
}

// ── Carteira Virtual ─────────────────────────────────────────────────────────

export type TipoOperacao = "compra" | "venda" | "dividendo" | "jcp" | "bonificacao";

export interface OperacaoCarteira {
  id: string;
  ticker: string;
  tipo: TipoOperacao;
  quantidade: number;
  preco_unitario: number;
  data: string;          // YYYY-MM-DD
  corretagem: number;
  observacao: string;
  timestamp: number;
}

export interface CarteiraFavorito {
  ticker: string;
  nome?: string;
  timestamp: number;
}

export interface PosicaoCarteira {
  ticker: string;
  operacoes: OperacaoCarteira[];
  quantidade_total: number;
  preco_medio: number;
  custo_total: number;
  corretagem_total: number;
  proventos_recebidos: number;
}

export interface PosicaoEnriquecida extends PosicaoCarteira {
  nome_curto?: string;
  setor?: string;
  subsetor?: string;
  preco_atual?: number;
  variacao_pct?: number;
  valor_atual?: number;
  lucro?: number;
  lucro_pct?: number;
  dy?: number;
  participacao_pct?: number;
}

/** Um ponto no histórico de preços (espelha PontoHistorico do backend). */
export interface PontoHistorico {
  data: string;
  abertura: number;
  maximo: number;
  minimo: number;
  fechamento: number;
  volume: number;
  fechamento_ajustado: number;
}
