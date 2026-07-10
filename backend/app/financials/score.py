"""RS Invest Score — pontuação 0-1000 para ativos B3."""
from __future__ import annotations

from typing import Optional
from pydantic import BaseModel

from .models import DemonstrativoAnual


class RSScore(BaseModel):
    score_total: int
    nota_geral: str  # Excelente / Muito Bom / Bom / Regular / Fraco

    # Categorias (máximos: 150+150+150+150+100+100+100+100 = 1000)
    lucros: int       # 0-150
    crescimento: int  # 0-150
    saude: int        # 0-150
    valuation_pts: int  # 0-150
    dividendos: int   # 0-100
    governanca: int   # 0-100
    momentum: int     # 0-100
    eficiencia: int   # 0-100

    pontos_fortes: list[str]
    pontos_fracos: list[str]


def _safe(value, default=None):
    """Retorna None se value for None, NaN ou infinito."""
    if value is None:
        return default
    try:
        f = float(value)
        if f != f or abs(f) == float("inf"):
            return default
        return f
    except (TypeError, ValueError):
        return default


def _cagr(inicio: float | None, fim: float | None, anos: int) -> float | None:
    """CAGR de inicio até fim em N anos. Retorna None se dados insuficientes."""
    s, f = _safe(inicio), _safe(fim)
    if s is None or f is None or anos <= 0 or s <= 0:
        return None
    return (f / s) ** (1 / anos) - 1


def _score_cagr(cagr: float | None) -> int:
    if cagr is None:
        return 0
    if cagr >= 0.15:
        return 50
    if cagr >= 0.10:
        return 40
    if cagr >= 0.05:
        return 25
    if cagr >= 0.00:
        return 10
    return 0


def _media(values: list[float | None]) -> float | None:
    vals = [_safe(v) for v in values if _safe(v) is not None]
    return sum(vals) / len(vals) if vals else None


def calcular_score_rs(
    historico: list[DemonstrativoAnual],
    preco_atual: float | None,
    preco_lucro: float | None,       # P/L do brapi
    dy_atual: float | None,          # Dividend Yield % do brapi
    upside_graham: float | None,     # ValuationData
    upside_dcf: float | None,        # ValuationData (cenário base)
    governanca_b3: str | None,       # segment da B3 (ex: "Novo Mercado")
    preco_max_52s: float | None,
    preco_min_52s: float | None,
) -> RSScore:
    anos = sorted(historico, key=lambda d: d.ano)
    ultimos = anos[-3:] if len(anos) >= 3 else anos
    ultimo = ultimos[-1] if ultimos else None

    pontos_fortes: list[str] = []
    pontos_fracos: list[str] = []

    # ── 1. QUALIDADE DOS LUCROS (0-150) ─────────────────────────────────────────
    roe_media = _media([d.roe for d in ultimos])
    ml_media = _media([d.margem_liquida for d in ultimos])
    lucros_positivos = sum(1 for d in ultimos if _safe(d.lucro_liquido, 0) > 0)

    def _pts_roe(v):
        if v is None: return 0
        if v >= 0.20: return 50
        if v >= 0.15: return 40
        if v >= 0.10: return 30
        if v >= 0.05: return 15
        return 0

    def _pts_ml(v):
        if v is None: return 0
        if v >= 0.20: return 50
        if v >= 0.15: return 40
        if v >= 0.10: return 30
        if v >= 0.05: return 15
        return 0

    def _pts_consist(n, total):
        ratio = n / total if total else 0
        if ratio >= 1.0: return 50
        if ratio >= 0.66: return 30
        if ratio >= 0.33: return 10
        return 0

    pts_lucros = (
        _pts_roe(roe_media)
        + _pts_ml(ml_media)
        + _pts_consist(lucros_positivos, len(ultimos))
    )
    if roe_media and roe_media >= 0.20:
        pontos_fortes.append(f"ROE médio excelente: {roe_media*100:.1f}%")
    elif roe_media and roe_media < 0.08:
        pontos_fracos.append(f"ROE médio baixo: {roe_media*100:.1f}%")

    if ml_media and ml_media >= 0.15:
        pontos_fortes.append(f"Margem líquida elevada: {ml_media*100:.1f}%")
    elif ml_media and ml_media < 0.05:
        pontos_fracos.append(f"Margem líquida comprimida: {ml_media*100:.1f}%")

    # ── 2. CRESCIMENTO (0-150) ────────────────────────────────────────────────────
    if len(anos) >= 2:
        cagr_rec = _cagr(
            anos[0].receita_liquida, anos[-1].receita_liquida, len(anos) - 1
        )
        cagr_luc = _cagr(
            abs(anos[0].lucro_liquido or 1) if anos[0].lucro_liquido else None,
            abs(anos[-1].lucro_liquido or 1) if anos[-1].lucro_liquido else None,
            len(anos) - 1,
        )
        cagr_pl = _cagr(
            anos[0].patrimonio_liquido, anos[-1].patrimonio_liquido, len(anos) - 1
        )
    else:
        cagr_rec = cagr_luc = cagr_pl = None

    pts_crescimento = (
        _score_cagr(cagr_rec)
        + _score_cagr(cagr_luc)
        + _score_cagr(cagr_pl)
    )
    if cagr_rec and cagr_rec >= 0.10:
        pontos_fortes.append(f"CAGR receita forte: {cagr_rec*100:.1f}%/ano")
    elif cagr_rec and cagr_rec < 0:
        pontos_fracos.append(f"Receita em queda: CAGR {cagr_rec*100:.1f}%/ano")

    # ── 3. SAÚDE FINANCEIRA (0-150) ───────────────────────────────────────────────
    liq_media = _media([d.liquidez_corrente for d in ultimos])
    dl_eb_media = _media([d.dl_ebitda for d in ultimos if _safe(d.dl_ebitda) is not None])
    fco_positivos = sum(1 for d in ultimos if _safe(d.fco, 0) > 0)

    def _pts_liquidez(v):
        if v is None: return 0
        if v >= 2.0: return 50
        if v >= 1.5: return 40
        if v >= 1.0: return 25
        return 0

    def _pts_dl_ebitda(v):
        if v is None: return 25  # sem dívida líquida = bom
        v = abs(v)
        if v <= 1.0: return 50
        if v <= 2.0: return 40
        if v <= 3.0: return 25
        if v <= 4.0: return 10
        return 0

    pts_saude = (
        _pts_liquidez(liq_media)
        + _pts_dl_ebitda(dl_eb_media)
        + _pts_consist(fco_positivos, len(ultimos))
    )

    if dl_eb_media is not None and abs(dl_eb_media) > 4:
        pontos_fracos.append(f"Endividamento alto: DL/EBITDA {abs(dl_eb_media):.1f}x")
    elif dl_eb_media is not None and abs(dl_eb_media) <= 1.5:
        pontos_fortes.append(f"Balanço sólido: DL/EBITDA {abs(dl_eb_media):.1f}x")

    if liq_media is not None and liq_media < 1.0:
        pontos_fracos.append(f"Liquidez corrente abaixo de 1 ({liq_media:.2f}x)")

    # ── 4. VALUATION (0-150) ──────────────────────────────────────────────────────
    def _pts_upside(v):
        if v is None: return 0
        if v >= 0.50: return 50
        if v >= 0.30: return 40
        if v >= 0.15: return 25
        if v >= 0.00: return 10
        return 0

    def _pts_pl(v):
        if v is None: return 15
        if v <= 0: return 0
        if 5 <= v <= 15: return 50
        if v < 5: return 35
        if v <= 25: return 30
        if v <= 40: return 15
        return 0

    pts_valuation = (
        _pts_upside(upside_graham)
        + _pts_upside(upside_dcf)
        + _pts_pl(preco_lucro)
    )

    if upside_graham and upside_graham >= 0.30:
        pontos_fortes.append(f"Upside Graham: +{upside_graham*100:.0f}%")
    elif upside_graham and upside_graham < -0.20:
        pontos_fracos.append(f"Superavaliado vs Graham: {upside_graham*100:.0f}%")

    # ── 5. DIVIDENDOS (0-100) ────────────────────────────────────────────────────
    dy = _safe(dy_atual)

    def _pts_dy(v):
        if v is None: return 0
        if v >= 6.0: return 50
        if v >= 4.0: return 40
        if v >= 2.0: return 25
        if v >= 0.5: return 10
        return 0

    fcl_positivos = sum(1 for d in ultimos if _safe(d.fcl, 0) > 0)

    pts_dividendos = _pts_dy(dy) + _pts_consist(fcl_positivos, len(ultimos))

    if dy and dy >= 5.0:
        pontos_fortes.append(f"Dividend yield atrativo: {dy:.1f}%")

    # ── 6. GOVERNANÇA (0-100) ────────────────────────────────────────────────────
    gov_map = {
        "Novo Mercado": 100,
        "Nível 2": 80,
        "Nível 1": 60,
        "Bovespa Mais": 40,
        "Bovespa Mais Nível 2": 45,
    }
    gov_str = (governanca_b3 or "").strip()
    pts_governanca = gov_map.get(gov_str, 20)
    if gov_str == "Novo Mercado":
        pontos_fortes.append("Governança Novo Mercado (máximo B3)")
    elif gov_str and pts_governanca < 40:
        pontos_fracos.append(f"Governança: {gov_str or 'Básica'}")

    # ── 7. MOMENTUM (0-100) ──────────────────────────────────────────────────────
    p = _safe(preco_atual)
    pmax = _safe(preco_max_52s)
    pmin = _safe(preco_min_52s)

    if p is not None and pmax is not None and pmin is not None and pmax > pmin:
        posicao_range = (p - pmin) / (pmax - pmin)
        pts_pos_range = int(posicao_range * 50)  # 0-50
    else:
        pts_pos_range = 25  # neutro

    # Variação 52S estimada vs mínima
    if pmin and pmin > 0 and p is not None:
        var_vs_min = (p - pmin) / pmin
        if var_vs_min >= 0.30:
            pts_mom_trend = 50
        elif var_vs_min >= 0.15:
            pts_mom_trend = 35
        elif var_vs_min >= 0.0:
            pts_mom_trend = 20
        else:
            pts_mom_trend = 5
    else:
        pts_mom_trend = 25

    pts_momentum = min(100, pts_pos_range + (pts_mom_trend // 2))

    # ── 8. EFICIÊNCIA (0-100) ────────────────────────────────────────────────────
    ebitda_m_media = _media([d.margem_ebitda for d in ultimos])
    roa_values = []
    for d in ultimos:
        ll = _safe(d.lucro_liquido)
        at = _safe(d.ativo_total)
        if ll is not None and at and at > 0:
            roa_values.append(ll / at)
    roa_media = _media(roa_values) if roa_values else None

    def _pts_ebitda_m(v):
        if v is None: return 0
        if v >= 0.30: return 50
        if v >= 0.20: return 40
        if v >= 0.10: return 25
        if v >= 0.05: return 10
        return 0

    def _pts_roa(v):
        if v is None: return 0
        if v >= 0.15: return 50
        if v >= 0.10: return 40
        if v >= 0.05: return 25
        if v >= 0.02: return 10
        return 0

    pts_eficiencia = _pts_ebitda_m(ebitda_m_media) + _pts_roa(roa_media)

    if ebitda_m_media and ebitda_m_media >= 0.25:
        pontos_fortes.append(f"Margem EBITDA robusta: {ebitda_m_media*100:.1f}%")

    # ── TOTAL & NOTA ───────────────────────────────────────────────────────────────
    total = (
        pts_lucros
        + pts_crescimento
        + pts_saude
        + pts_valuation
        + pts_dividendos
        + pts_governanca
        + pts_momentum
        + pts_eficiencia
    )
    total = max(0, min(1000, total))

    if total >= 800:
        nota = "Excelente"
    elif total >= 650:
        nota = "Muito Bom"
    elif total >= 500:
        nota = "Bom"
    elif total >= 350:
        nota = "Regular"
    else:
        nota = "Fraco"

    # Lucro negativo no último ano — ponto fraco crítico
    if ultimo and _safe(ultimo.lucro_liquido, 0) <= 0:
        pontos_fracos.insert(0, "Empresa em prejuízo no último exercício")

    return RSScore(
        score_total=total,
        nota_geral=nota,
        lucros=min(150, pts_lucros),
        crescimento=min(150, pts_crescimento),
        saude=min(150, pts_saude),
        valuation_pts=min(150, pts_valuation),
        dividendos=min(100, pts_dividendos),
        governanca=min(100, pts_governanca),
        momentum=min(100, pts_momentum),
        eficiencia=min(100, pts_eficiencia),
        pontos_fortes=pontos_fortes[:5],
        pontos_fracos=pontos_fracos[:5],
    )
