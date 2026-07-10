"""
Engine de Valuation — Fase 3.

Métodos implementados:
  1. DCF  — FCL/ação projetado por N anos + valor terminal (Gordon Growth) — peso 60%
  2. P/L  — LPA × múltiplo-alvo por cenário                               — peso 25%
  3. P/VP — VPA × múltiplo-alvo por cenário                               — peso 15%

upside_pct = composto ponderado DCF 60% + P/L 25% + P/VP 15% (pesos renormalizados se método falhar).
Graham removido do cálculo e da exibição.

Três cenários:
  Pessimista — crescimento conservador, maior taxa de desconto
  Base       — crescimento moderado (próximo ao CAGR histórico), desconto médio
  Otimista   — crescimento acelerado, menor taxa de desconto

Veredicto final:
  SUBAVALIADA          → upside ≥ 20 %
  LEVEMENTE SUBAVALIADA → 5 % ≤ upside < 20 %
  JUSTA                → -5 % < upside < 5 %
  LEVEMENTE SUPERAVALIADA → -20 % < upside ≤ -5 %
  SUPERAVALIADA        → upside ≤ -20 %
"""
import math
from typing import Optional

from ..financials.models import DemonstrativoAnual
from .models import CenarioValuation, MetodoValuation, ValuationData

# ── Parâmetros globais ────────────────────────────────────────────────────────

ANOS_DCF = 5
CRESCIMENTO_TERMINAL = 0.04   # PIB nominal brasileiro de longo prazo (~4%)

# Configuração dos três cenários
_CENARIOS = [
    {
        "nome":        "Pessimista",
        "delta_g":     -0.04,   # crescimento base − 4 p.p.
        "taxa_desc":   0.15,    # WACC conservador (Selic + prêmio risco elevado)
        "pl_alvo":     8,
        "pvp_alvo":    0.80,
    },
    {
        "nome":        "Base",
        "delta_g":     0.00,    # igual ao CAGR histórico ajustado
        "taxa_desc":   0.12,    # WACC moderado
        "pl_alvo":     12,
        "pvp_alvo":    1.40,
    },
    {
        "nome":        "Otimista",
        "delta_g":     +0.05,   # crescimento base + 5 p.p.
        "taxa_desc":   0.10,    # WACC favorável
        "pl_alvo":     17,
        "pvp_alvo":    2.00,
    },
]


# ── Helpers ───────────────────────────────────────────────────────────────────

def _dcf(fcl: float, g: float, r: float, anos: int = ANOS_DCF) -> Optional[float]:
    """
    DCF com crescimento constante por `anos` anos seguido de perpetuidade.
    Retorna None se os parâmetros tornariam o cálculo inválido.
    """
    g_t = CRESCIMENTO_TERMINAL
    if r <= g_t:          # evita divisão por zero na perpetuidade
        return None
    if r <= 0 or anos <= 0:
        return None

    pv = 0.0
    for i in range(1, anos + 1):
        cf = fcl * (1 + g) ** i
        pv += cf / (1 + r) ** i

    # Valor terminal: FCL no último ano cresce à g_t para sempre
    fcl_terminal = fcl * (1 + g) ** anos * (1 + g_t)
    tv = fcl_terminal / (r - g_t)
    pv += tv / (1 + r) ** anos

    return pv if pv > 0 else None


def _media_fcl(historico: list[DemonstrativoAnual], n: int = 3) -> Optional[float]:
    """
    Média do FCL dos últimos `n` anos.
    Fallback: FCO × 0.7 quando FCL não disponível.
    """
    fcls = [h.fcl for h in historico[-n:] if h.fcl is not None and h.fcl > 0]
    if fcls:
        return sum(fcls) / len(fcls)

    fcos = [h.fco for h in historico[-n:] if h.fco is not None and h.fco > 0]
    if fcos:
        return (sum(fcos) / len(fcos)) * 0.70  # capex proxy: 30% do FCO

    return None


def _clamp_g(cagr: Optional[float]) -> float:
    """Ajusta CAGR histórico para uso no modelo (limites razoáveis)."""
    if cagr is None:
        return 0.06   # default conservador
    return max(-0.03, min(cagr, 0.20))


def _upside(pj: Optional[float], mercado: float) -> Optional[float]:
    if pj is None or mercado <= 0:
        return None
    return (pj - mercado) / mercado


def _veredicto(upside: Optional[float]) -> tuple[str, str]:
    """Retorna (texto_veredicto, cor)."""
    if upside is None:
        return "INCONCLUSIVO", "neutro"
    if upside >= 0.20:
        return "SUBAVALIADA", "verde"
    if upside >= 0.05:
        return "LEVEMENTE SUBAVALIADA", "verde"
    if upside <= -0.20:
        return "SUPERAVALIADA", "vermelho"
    if upside <= -0.05:
        return "LEVEMENTE SUPERAVALIADA", "vermelho"
    return "JUSTA", "amarelo"


# ── Engine principal ──────────────────────────────────────────────────────────

def calcular_valuation(
    ticker: str,
    preco_atual: float,
    market_cap: Optional[float],
    historico: list[DemonstrativoAnual],
    cagr_receita: Optional[float],
    cagr_lucro: Optional[float],
) -> ValuationData:
    """
    Calcula o preço justo estimado usando múltiplos métodos e três cenários.
    Retorna ValuationData pronto para serialização.
    """
    if not historico or preco_atual <= 0:
        return ValuationData(ticker=ticker, preco_atual=preco_atual)

    # ── Métricas por ação ─────────────────────────────────────────────────────
    shares = (market_cap / preco_atual) if market_cap and preco_atual > 0 else None
    ultimo = historico[-1]

    eps = (ultimo.lucro_liquido / shares) if (shares and ultimo.lucro_liquido is not None) else None
    bvs = (ultimo.patrimonio_liquido / shares) if (shares and ultimo.patrimonio_liquido is not None) else None

    fcl_medio = _media_fcl(historico)
    fcl_por_acao = (fcl_medio / shares) if (fcl_medio and shares) else None

    # Dívida líquida por ação (ajuste no valor do DCF)
    dl_por_acao: Optional[float] = None
    if shares and ultimo.passivo_nao_circulante is not None and ultimo.caixa is not None:
        dl_por_acao = (ultimo.passivo_nao_circulante - ultimo.caixa) / shares

    # Taxa de crescimento base (usa CAGR de lucro como mais conservador)
    g_base = _clamp_g(cagr_lucro or cagr_receita)

    # ── Método Graham ─────────────────────────────────────────────────────────
    graham_pj: Optional[float] = None
    if eps is not None and bvs is not None and eps > 0 and bvs > 0:
        graham_pj = math.sqrt(22.5 * eps * bvs)

    # ── Cenários (DCF + P/L + P/VP) ──────────────────────────────────────────
    cenarios: list[CenarioValuation] = []

    for cfg in _CENARIOS:
        g = g_base + cfg["delta_g"]
        r = cfg["taxa_desc"]
        nome = cfg["nome"]

        # DCF
        pj_dcf: Optional[float] = None
        if fcl_por_acao and fcl_por_acao > 0:
            pj_dcf = _dcf(fcl_por_acao, g, r)
            if pj_dcf and dl_por_acao is not None:
                pj_dcf = max(0.01, pj_dcf - dl_por_acao)

        # Múltiplos
        pj_pl  = (eps * cfg["pl_alvo"])  if (eps  and eps  > 0) else None
        pj_pvp = (bvs * cfg["pvp_alvo"]) if (bvs  and bvs  > 0) else None

        # Composto ponderado: DCF 60% + P/L 25% + P/VP 15%. Graham excluído.
        pesos = [(pj_dcf, 0.60), (pj_pl, 0.25), (pj_pvp, 0.15)]
        validos = [(v, w) for v, w in pesos if v and v > 0]
        if validos:
            total_w = sum(w for _, w in validos)
            pj_cenario = sum(v * w for v, w in validos) / total_w
        else:
            pj_cenario = None

        cenarios.append(CenarioValuation(
            nome=nome,
            taxa_crescimento=g,
            taxa_desconto=r,
            preco_justo=round(pj_cenario, 2) if pj_cenario else None,
            upside_pct=_upside(pj_cenario, preco_atual),
        ))

    # ── Métodos individuais (cenário Base) ───────────────────────────────────
    cfg_base = _CENARIOS[1]   # índice 1 = Base
    g = g_base + cfg_base["delta_g"]
    r = cfg_base["taxa_desc"]

    metodos: list[MetodoValuation] = []

    if eps and eps > 0:
        pj = eps * cfg_base["pl_alvo"]
        metodos.append(MetodoValuation(
            nome="P/L",
            descricao=f"LPA × {cfg_base['pl_alvo']}x (múltiplo histórico B3)",
            preco_justo=round(pj, 2),
            upside_pct=_upside(pj, preco_atual),
        ))

    if bvs and bvs > 0:
        pj = bvs * cfg_base["pvp_alvo"]
        metodos.append(MetodoValuation(
            nome="P/VP",
            descricao=f"VPA × {cfg_base['pvp_alvo']}x (múltiplo patrimonial)",
            preco_justo=round(pj, 2),
            upside_pct=_upside(pj, preco_atual),
        ))

    # DCF — método principal para upside
    pj_dcf_base: Optional[float] = None
    if fcl_por_acao and fcl_por_acao > 0:
        pj_dcf = _dcf(fcl_por_acao, g, r)
        if pj_dcf:
            if dl_por_acao is not None:
                pj_dcf = max(0.01, pj_dcf - dl_por_acao)
            pj_dcf_base = round(pj_dcf, 2)
            metodos.append(MetodoValuation(
                nome="DCF",
                descricao=f"FCL/ação descontado a {r*100:.0f}% a.a. (WACC), crescimento terminal {CRESCIMENTO_TERMINAL*100:.0f}%",
                preco_justo=pj_dcf_base,
                upside_pct=_upside(pj_dcf_base, preco_atual),
            ))

    # ── Preço justo composto ─────────────────────────────────────────────────
    # Média ponderada: DCF 60% + P/L 25% + P/VP 15% (Graham excluído)
    # Usa cenário Base que já computa DCF + P/L + P/VP sem Graham
    cenario_base = next((c for c in cenarios if c.nome == "Base"), None)
    pj_composto = cenario_base.preco_justo if cenario_base else None
    if pj_composto:
        pj_composto = round(pj_composto, 2)

    upside_final = _upside(pj_composto, preco_atual)
    margem_seg = ((pj_composto - preco_atual) / pj_composto) if pj_composto else None

    texto, cor = _veredicto(upside_final)

    return ValuationData(
        ticker=ticker,
        preco_atual=preco_atual,
        shares=shares,
        eps=round(eps, 4) if eps is not None else None,
        bvs=round(bvs, 4) if bvs is not None else None,
        fcl_por_acao=round(fcl_por_acao, 4) if fcl_por_acao is not None else None,
        metodos=metodos,
        cenarios=cenarios,
        preco_justo_base=pj_composto,
        upside_pct=round(upside_final, 4) if upside_final is not None else None,
        margem_seguranca=round(margem_seg, 4) if margem_seg is not None else None,
        veredicto=texto,
        veredicto_cor=cor,
        premissas={
            "g_base_usado": round(g_base, 4),
            "cagr_receita_historico": round(cagr_receita, 4) if cagr_receita else None,
            "cagr_lucro_historico": round(cagr_lucro, 4) if cagr_lucro else None,
            "anos_dcf": ANOS_DCF,
            "crescimento_terminal_pct": CRESCIMENTO_TERMINAL * 100,
            "ultimo_exercicio": historico[-1].ano,
            "n_anos_historico": len(historico),
        },
    )
