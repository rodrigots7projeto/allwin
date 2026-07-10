"""Modelos Pydantic para o engine de valuation (Fase 3)."""
from typing import Optional
from pydantic import BaseModel


class MetodoValuation(BaseModel):
    """Resultado de um método de valuation individual."""
    nome: str           # Graham | P/L | P/VP | DCF
    descricao: str      # fórmula ou premissa usada
    preco_justo: Optional[float] = None
    upside_pct: Optional[float] = None   # (pj - mercado) / mercado


class CenarioValuation(BaseModel):
    """Projeção de preço justo em um cenário específico."""
    nome: str           # Pessimista | Base | Otimista
    taxa_crescimento: float
    taxa_desconto: float
    preco_justo: Optional[float] = None
    upside_pct: Optional[float] = None


class ValuationData(BaseModel):
    """Resposta completa do endpoint /valuation/{ticker}."""
    ticker: str
    preco_atual: float

    # Métricas por ação usadas nos cálculos
    shares: Optional[float] = None     # ações em circulação (market_cap / preco)
    eps: Optional[float] = None        # lucro por ação
    bvs: Optional[float] = None        # valor patrimonial por ação
    fcl_por_acao: Optional[float] = None  # FCL médio por ação

    # Resultados dos métodos (cenário base)
    metodos: list[MetodoValuation] = []

    # Três cenários: Pessimista / Base / Otimista
    cenarios: list[CenarioValuation] = []

    # Síntese
    preco_justo_base: Optional[float] = None    # média ponderada dos métodos no cenário base
    upside_pct: Optional[float] = None          # (pj_base - preco_atual) / preco_atual
    margem_seguranca: Optional[float] = None    # (pj_base - preco_atual) / pj_base

    # Veredicto
    veredicto: str = "INCONCLUSIVO"
    veredicto_cor: str = "neutro"   # verde | amarelo | vermelho | neutro

    # Premissas usadas (para transparência ao usuário)
    premissas: dict = {}
