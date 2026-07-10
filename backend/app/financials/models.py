"""Modelos Pydantic para dados fundamentalistas (Fase 2)."""
from typing import Optional
from pydantic import BaseModel


class DemonstrativoAnual(BaseModel):
    """Métricas financeiras de um exercício anual derivadas do CVM DFP."""
    ano: int
    # ── DRE ──────────────────────────────────────────────
    receita_liquida:  Optional[float] = None
    lucro_bruto:      Optional[float] = None
    ebit:             Optional[float] = None
    ebitda:           Optional[float] = None   # EBIT + D&A (D&A extraído do DFC)
    lucro_liquido:    Optional[float] = None
    # ── Balanço Ativo ─────────────────────────────────────
    ativo_total:      Optional[float] = None
    ativo_circulante: Optional[float] = None
    caixa:            Optional[float] = None
    # ── Balanço Passivo ───────────────────────────────────
    passivo_circulante:      Optional[float] = None
    passivo_nao_circulante:  Optional[float] = None
    patrimonio_liquido:      Optional[float] = None
    # ── DFC ───────────────────────────────────────────────
    fco:  Optional[float] = None   # fluxo caixa operacional
    fci:  Optional[float] = None   # fluxo caixa investimento (negativo = saída)
    fcl:  Optional[float] = None   # fluxo de caixa livre = FCO + FCI
    # ── Calculados ────────────────────────────────────────
    margem_bruta:    Optional[float] = None   # Lucro Bruto / Receita
    margem_ebit:     Optional[float] = None   # EBIT / Receita
    margem_ebitda:   Optional[float] = None   # EBITDA / Receita
    margem_liquida:  Optional[float] = None   # Lucro Líquido / Receita
    roe:             Optional[float] = None   # Lucro Líquido / PL médio
    liquidez_corrente: Optional[float] = None # Ativo Circ. / Passivo Circ.
    # DL estimada = Passivo NC − Caixa (proxy; dívida financeira real requer sub-contas)
    divida_liquida_estimada: Optional[float] = None
    dl_ebitda:       Optional[float] = None   # Dívida Líq. / EBITDA


class IndicadorComSinal(BaseModel):
    """Valor atual de um indicador com comparação à sua média histórica."""
    valor:            Optional[float]
    media_historica:  Optional[float]
    # verde = melhor que a média | amarelo = próximo | vermelho = pior
    sinal:            str   # verde / amarelo / vermelho / neutro
    melhor_quando:    str   # "maior" ou "menor"


class FundamentosData(BaseModel):
    """Resposta completa do endpoint /fundamentos/{ticker}."""
    ticker:   str
    cd_cvm:   Optional[str] = None
    fonte:    str = "CVM DFP"
    # Série histórica (ordem cronológica crescente)
    historico: list[DemonstrativoAnual]
    # Indicadores de mercado (vindos do brapi)
    pl_atual:      Optional[float] = None   # P/L
    pvp_atual:     Optional[float] = None   # P/VP
    ev_ebitda_atual: Optional[float] = None
    dy_atual:      Optional[float] = None   # Dividend Yield %
    # Taxas de crescimento anuais compostas (CAGR)
    cagr_receita: Optional[float] = None
    cagr_lucro:   Optional[float] = None
    cagr_pl:      Optional[float] = None
    # Sinais baseados no histórico do próprio ativo
    sinais: dict[str, IndicadorComSinal] = {}
