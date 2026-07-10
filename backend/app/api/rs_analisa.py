"""RS Analisa — endpoint agregador de inteligência financeira para ativos B3."""
from __future__ import annotations

import asyncio
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..data.brapi import BrapiProvider
from ..data.cvm import buscar_fundamentos_cvm
from ..data.provider import QuoteData
from ..financials.indicators import calcular_cagrs, calcular_demonstrativos, calcular_sinais
from ..financials.models import DemonstrativoAnual, FundamentosData
from ..financials.score import RSScore, calcular_score_rs
from ..valuation.engine import calcular_valuation
from ..valuation.models import ValuationData

router = APIRouter(prefix="/rs-analisa", tags=["RS Analisa"])
_provider = BrapiProvider()


class RSAlerta(BaseModel):
    tipo: str       # critico | atencao | positivo | info
    titulo: str
    descricao: str
    categoria: str


class RSAnaliseIA(BaseModel):
    resumo_executivo: str
    situacao_financeira: str
    qualidade_lucros: str
    crescimento: str
    endividamento: str
    dividendos: str
    perspectivas: str
    riscos: list[str]
    pontos_fortes: list[str]
    pontos_fracos: list[str]


class RSAnalisaData(BaseModel):
    ticker: str
    timestamp: str

    # Tipo de ativo
    is_fii: bool = False
    fii_tipo: Optional[str] = None          # Logística, CRI, Shoppings, etc.
    fii_descricao: Optional[str] = None     # Resumo do fundo

    # Cadastrais B3
    empresa: str
    setor: Optional[str] = None
    subsetor: Optional[str] = None
    segmento_b3: Optional[str] = None
    governanca: Optional[str] = None
    cnpj: Optional[str] = None
    website: Optional[str] = None
    data_listagem: Optional[str] = None
    indices: list[str] = []

    # Cotação
    cotacao: QuoteData
    var_mes: Optional[float] = None
    var_ano: Optional[float] = None
    historico_mensal: list[dict] = []

    # Score RS Invest
    score: RSScore

    # Fundamentos (somente ações)
    fundamentos: Optional[FundamentosData] = None

    # Valuation (somente ações)
    valuation: Optional[ValuationData] = None

    # Alertas automáticos
    alertas: list[RSAlerta] = []

    # Análise IA
    analise: RSAnaliseIA


# ── Detecção e lógica FII ─────────────────────────────────────────────────────

def _is_fii(ticker: str, nome: str, setor: str | None) -> bool:
    """Heurística: FII termina em 11 e não é ETF (BOVA11, IVVB11 são ETFs)."""
    etfs_conhecidos = {"BOVA11", "IVVB11", "SMAL11", "XBOV11", "HASH11", "GOLD11", "TRIG11"}
    if ticker in etfs_conhecidos:
        return False
    if ticker.endswith("11"):
        return True
    if setor and "fundo" in setor.lower():
        return True
    if nome and "fundo de investimento imobiliário" in nome.lower():
        return True
    return False


async def _buscar_summary_profile(ticker: str) -> dict:
    """Busca summaryProfile via brapi para obter tipo e descrição do FII."""
    import httpx
    from ..config import settings
    from ..data.brapi import BRAPI_BASE
    from ..data.cache import cache

    chave = f"summary_profile:{ticker}"
    cached = cache.get(chave)
    if cached:
        return cached

    headers = {"Accept": "application/json"}
    if settings.brapi_token:
        headers["Authorization"] = f"Bearer {settings.brapi_token}"

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                f"{BRAPI_BASE}/quote/{ticker}",
                params={"modules": "summaryProfile"},
                headers=headers,
            )
        if resp.status_code == 200:
            data = resp.json()
            result = (data.get("results") or [{}])[0]
            sp = result.get("summaryProfile") or {}
            profile = {
                "setor": sp.get("sector") or result.get("sector"),
                "tipo": sp.get("industryDisp") or result.get("industry"),
                "descricao": sp.get("longBusinessSummary", ""),
            }
            cache.set(chave, profile, 24 * 3600)  # 24h
            return profile
    except Exception:
        pass
    return {}


def _calcular_score_fii(
    cotacao: QuoteData,
    indices: list[str],
    historico_mensal: list[dict],
) -> RSScore:
    """Score FII (0–1000): baseado em 52S, IFIX, momentum, volatilidade."""
    pontos_fortes: list[str] = []
    pontos_fracos: list[str] = []

    p   = cotacao.preco_atual or 0
    pmax = cotacao.cinquenta_dois_semanas_alta or p
    pmin = cotacao.cinquenta_dois_semanas_baixa or p

    # 1. Posição no range 52S → momentum (0-200)
    amplitude = pmax - pmin if pmax > pmin else 1
    posicao_range = (p - pmin) / amplitude  # 0=mínimo, 1=máximo
    pts_posicao = int(posicao_range * 150) + 50  # 50-200

    # 2. Membership em índices (0-300)
    pts_indices = 0
    if "IFIX" in indices:
        pts_indices += 250
        pontos_fortes.append("Compõe o IFIX (índice de referência FII)")
    for idx in indices:
        if idx not in ("IFIX",):
            pts_indices += 20
    pts_indices = min(300, pts_indices)

    # 3. Volatilidade 52S (0-200) — menor volatilidade = fundo mais estável
    if pmin > 0:
        volatilidade = (pmax - pmin) / pmin
    else:
        volatilidade = 0.5
    if volatilidade <= 0.15:
        pts_vol = 200
        pontos_fortes.append(f"Baixa volatilidade: range 52S de {volatilidade*100:.0f}%")
    elif volatilidade <= 0.25:
        pts_vol = 150
    elif volatilidade <= 0.40:
        pts_vol = 100
    else:
        pts_vol = 50
        pontos_fracos.append(f"Volatilidade elevada: range 52S de {volatilidade*100:.0f}%")

    # 4. Variação anual (0-200)
    var_anual = 0.0
    if historico_mensal and len(historico_mensal) >= 2:
        p0 = historico_mensal[0].get("fechamento", 0)
        pN = historico_mensal[-1].get("fechamento", 0)
        if p0 > 0:
            var_anual = (pN - p0) / p0
    if var_anual >= 0.10:
        pts_tend = 200
        pontos_fortes.append(f"Valorização de {var_anual*100:.1f}% em 12 meses")
    elif var_anual >= 0.05:
        pts_tend = 150
    elif var_anual >= 0.0:
        pts_tend = 100
    elif var_anual >= -0.10:
        pts_tend = 50
        pontos_fracos.append(f"Queda de {abs(var_anual)*100:.1f}% em 12 meses")
    else:
        pts_tend = 20
        pontos_fracos.append(f"Desvalorização acentuada: {var_anual*100:.1f}% em 12 meses")

    # 5. Próximo do fundo 52S = boa entrada (0-100)
    # Se preço está perto do mínimo, pode ser compra; se perto do topo, pode ser caro
    if posicao_range <= 0.25:
        pts_entrada = 80
        pontos_fortes.append("Preço próximo à mínima de 52 semanas — potencial de entrada")
    elif posicao_range <= 0.50:
        pts_entrada = 60
    elif posicao_range <= 0.75:
        pts_entrada = 40
    else:
        pts_entrada = 20
        pontos_fracos.append("Preço próximo à máxima de 52 semanas — avalie o timing")

    total = pts_posicao + pts_indices + pts_vol + pts_tend + pts_entrada
    total = max(0, min(1000, total))

    if total >= 750:
        nota = "Excelente"
    elif total >= 600:
        nota = "Muito Bom"
    elif total >= 450:
        nota = "Bom"
    elif total >= 300:
        nota = "Regular"
    else:
        nota = "Fraco"

    # categorias preenchidas para compatibilidade com RSScore
    return RSScore(
        score_total=total,
        nota_geral=nota,
        lucros=0,
        crescimento=0,
        saude=0,
        valuation_pts=pts_posicao,
        dividendos=pts_indices,
        governanca=pts_vol,
        momentum=pts_tend,
        eficiencia=pts_entrada,
        pontos_fortes=pontos_fortes[:5],
        pontos_fracos=pontos_fracos[:5],
    )


def _gerar_alertas_fii(
    cotacao: QuoteData,
    indices: list[str],
    score: RSScore,
    historico_mensal: list[dict],
    fii_tipo: str | None,
) -> list[RSAlerta]:
    alertas: list[RSAlerta] = []

    p    = cotacao.preco_atual or 0
    pmax = cotacao.cinquenta_dois_semanas_alta or p
    pmin = cotacao.cinquenta_dois_semanas_baixa or p
    amplitude = pmax - pmin if pmax > pmin else 1
    posicao = (p - pmin) / amplitude if amplitude > 0 else 0.5

    if "IFIX" in indices:
        alertas.append(RSAlerta(
            tipo="positivo",
            titulo="Componente do IFIX",
            descricao="O fundo faz parte do IFIX, índice de referência dos FIIs listados na B3, indicando liquidez e relevância de mercado.",
            categoria="indices",
        ))

    if posicao <= 0.25:
        alertas.append(RSAlerta(
            tipo="positivo",
            titulo="Preço próximo à mínima de 52 semanas",
            descricao=f"Cotas negociadas a R$ {p:.2f}, próximas à mínima de R$ {pmin:.2f} dos últimos 12 meses — possível oportunidade de entrada.",
            categoria="preco",
        ))
    elif posicao >= 0.80:
        alertas.append(RSAlerta(
            tipo="atencao",
            titulo="Preço próximo à máxima de 52 semanas",
            descricao=f"Cotas a R$ {p:.2f}, perto da máxima de R$ {pmax:.2f} — avalie o preço antes de aportar.",
            categoria="preco",
        ))

    if pmax > 0 and (pmax - pmin) / pmax > 0.30:
        alertas.append(RSAlerta(
            tipo="atencao",
            titulo="Volatilidade elevada",
            descricao=f"Amplitude de 52 semanas de {((pmax-pmin)/pmin*100):.0f}% (R$ {pmin:.2f} – R$ {pmax:.2f}) indica volatilidade acima da média para FIIs.",
            categoria="volatilidade",
        ))

    var_anual = None
    if historico_mensal and len(historico_mensal) >= 2:
        p0 = historico_mensal[0].get("fechamento", 0)
        pN = historico_mensal[-1].get("fechamento", 0)
        if p0 > 0:
            var_anual = (pN - p0) / p0

    if var_anual is not None and var_anual < -0.10:
        alertas.append(RSAlerta(
            tipo="critico",
            titulo="Desvalorização acentuada em 12 meses",
            descricao=f"Cotas acumulam queda de {abs(var_anual)*100:.1f}% nos últimos 12 meses — investigue os motivos antes de investir.",
            categoria="retorno",
        ))

    if fii_tipo:
        tipo_map = {
            "logística": "Fundos logísticos tendem a ter contratos longos e vacância baixa — verifique a taxa de ocupação do portfólio.",
            "shoppings": "FIIs de shopping têm receita atrelada ao consumo — acompanhe a evolução das vendas nas mesmas lojas (SSS).",
            "lajes corporativas": "Escritórios sofrem com vacância — consulte o relatório gerencial do fundo para taxa de ocupação e contratos.",
            "cri": "Fundos de papel (CRI/LCI) têm renda previsível e menor risco de vacância, mas sensíveis à curva de juros.",
            "recebíveis": "Fundo de recebíveis (papel): rendimento atrelado a IPCA/CDI — vantajoso em cenários de juros elevados.",
            "multicategoria": "Fundo diversificado: exposição a múltiplos segmentos reduz risco específico de setor.",
            "residencial": "FIIs residenciais são segmento emergente no Brasil — verifique o histórico de distribuições.",
            "agro": "FIIs do agronegócio: rendimento ligado à produção agrícola e contratos de arrendamento.",
        }
        tipo_lower = fii_tipo.lower()
        dica = next((v for k, v in tipo_map.items() if k in tipo_lower), None)
        if dica:
            alertas.append(RSAlerta(
                tipo="info",
                titulo=f"Tipo: {fii_tipo}",
                descricao=dica,
                categoria="tipo_fundo",
            ))

    alertas.append(RSAlerta(
        tipo="info",
        titulo="Score baseado em dados de mercado",
        descricao="FIIs não publicam DFP no formato CVM de ações. O Score RS Invest usa cotação, índices B3 e histórico de preços.",
        categoria="sistema",
    ))

    return alertas


def _gerar_analise_fii(
    ticker: str,
    empresa: str,
    cotacao: QuoteData,
    score: RSScore,
    indices: list[str],
    historico_mensal: list[dict],
    fii_tipo: str | None,
    fii_descricao: str | None,
) -> RSAnaliseIA:
    p    = cotacao.preco_atual or 0
    pmax = cotacao.cinquenta_dois_semanas_alta or p
    pmin = cotacao.cinquenta_dois_semanas_baixa or p
    nota = score.nota_geral

    nome_curto = empresa.split(" ")[0] if empresa else ticker

    var_anual = None
    if historico_mensal and len(historico_mensal) >= 2:
        p0 = historico_mensal[0].get("fechamento", 0)
        pN = historico_mensal[-1].get("fechamento", 0)
        if p0 > 0:
            var_anual = (pN - p0) / p0

    # Resumo
    nota_adj = {
        "Excelente": "excelente desempenho", "Muito Bom": "bom desempenho",
        "Bom": "desempenho satisfatório", "Regular": "desempenho misto",
        "Fraco": "desempenho fraco",
    }.get(nota, "desempenho a avaliar")

    tipo_str = f" do segmento {fii_tipo}" if fii_tipo else ""
    resumo = (
        f"{empresa} ({ticker}) é um Fundo de Investimento Imobiliário (FII){tipo_str} "
        f"listado na B3 com Score RS Invest de {score.score_total}/1000 ({nota}) "
        f"e {nota_adj} de mercado. "
        f"As cotas são negociadas a R$ {p:.2f}, dentro de um intervalo de 52 semanas "
        f"entre R$ {pmin:.2f} e R$ {pmax:.2f}."
    )
    if "IFIX" in indices:
        resumo += " O fundo é componente do IFIX, índice de referência do setor."

    # Situação financeira (FIIs não têm DRE tradicional)
    sit_fin = (
        f"FIIs distribuem obrigatoriamente ao menos 95% do lucro semestral "
        f"em forma de rendimentos mensais isentos de IR para pessoas físicas (para quem possui menos de 10% das cotas). "
        f"A análise de saúde financeira de um FII deve focar nos relatórios gerenciais mensais, "
        f"taxa de vacância, contratos em vigor e distribuições por cota (DY). "
        f"Recomendamos consultar o relatório do gestor em brapi.dev ou fundosnet.cvm.gov.br."
    )

    # Qualidade (segmento)
    if fii_tipo:
        tipo_lower = fii_tipo.lower()
        if "logística" in tipo_lower or "galpão" in tipo_lower:
            qual = (
                f"Fundos logísticos como {ticker} se beneficiam do crescimento do e-commerce "
                f"e da demanda por galpões próximos a centros urbanos. "
                f"Verifique a localização do portfólio, os contratos atípicos vs típicos e a taxa de vacância atual."
            )
        elif "cri" in tipo_lower or "recebível" in tipo_lower or "papel" in tipo_lower:
            qual = (
                f"Fundos de papel como {ticker} investem em CRIs (Certificados de Recebíveis Imobiliários) "
                f"e têm rendimento indexado a CDI ou IPCA. "
                f"Em cenário de juros altos são privilegiados; em queda de Selic pode haver redução de rendimento."
            )
        elif "shopping" in tipo_lower or "varejo" in tipo_lower:
            qual = (
                f"{ticker} é um FII de shoppings com renda variável atrelada ao volume de vendas. "
                f"Indicadores chave: NOI, SSS (vendas mesmas lojas) e taxa de ocupação. "
                f"Shoppings premium tendem a ser mais resilientes."
            )
        elif "laje" in tipo_lower or "corporativo" in tipo_lower or "escritório" in tipo_lower:
            qual = (
                f"FIIs de lajes corporativas como {ticker} enfrentam vacância como principal risco. "
                f"Verifique o relatório gerencial para taxa de ocupação atual e prazo médio de contratos."
            )
        elif "multicategor" in tipo_lower or "diversif" in tipo_lower:
            qual = (
                f"{ticker} é um fundo diversificado com exposição a múltiplos segmentos imobiliários, "
                f"o que reduz o risco de concentração setorial."
            )
        else:
            qual = (
                f"{ticker} atua no segmento '{fii_tipo}'. "
                f"Avalie o portfólio, gestora, vacância e histórico de distribuições para uma análise completa."
            )
    elif fii_descricao:
        qual = fii_descricao[:300] + ("…" if len(fii_descricao) > 300 else "")
    else:
        qual = (
            f"{ticker} é um FII listado na B3. Para análise completa, "
            f"consulte os relatórios gerenciais mensais disponíveis no site da gestora e no FundosNet (CVM)."
        )

    # Crescimento
    if var_anual is not None:
        sinal = "+" if var_anual >= 0 else ""
        cresc = (
            f"As cotas de {ticker} acumulam variação de {sinal}{var_anual*100:.1f}% nos últimos 12 meses. "
        )
        if var_anual >= 0.08:
            cresc += "O desempenho supera a inflação (IPCA) e se aproxima da Selic — sinal positivo para o setor."
        elif var_anual >= 0:
            cresc += "O desempenho é modesto em termos de valorização de cota, sendo o rendimento mensal o principal retorno."
        else:
            cresc += "A queda nas cotas pode indicar aumento de vacância, redução de contratos ou saída de cotistas — investigue a causa."
    else:
        cresc = (
            f"Sem histórico de preços disponível para cálculo de variação anual de {ticker}. "
            f"Consulte os dados históricos no site da B3 ou brapi.dev."
        )

    # Endividamento (FII não tem DL/EBITDA)
    endiv = (
        f"FIIs podem emitir dívida (CRIs e debentures) para alavancagem do portfólio, "
        f"mas são limitados regulatoriamente. Verifique o índice de alavancagem "
        f"nos relatórios gerenciais do fundo. Fundos de papel têm perfil de dívida muito diferente de fundos de tijolo."
    )

    # Dividendos
    div_txt = (
        f"Os rendimentos de FIIs são distribuídos mensalmente e isentos de IR para PF com menos de 10% das cotas. "
        f"Para calcular o DY real de {ticker}, divida o somatório dos últimos 12 meses de rendimento por cota "
        f"pelo preço atual da cota (R$ {p:.2f}). "
        f"Rendimentos acima de 8% a.a. são considerados atrativos frente ao CDI."
    )

    # Perspectivas
    if score.score_total >= 600:
        persp = (
            f"Com Score RS Invest de {score.score_total}/1000 e presença em índices de qualidade, "
            f"{ticker} mostra fundamentos de mercado favoráveis. "
            f"Nos próximos anos, o desempenho dependerá da taxa de juros (Selic), "
            f"expansão do portfólio e qualidade de gestão. "
            f"Acompanhe os relatórios gerenciais mensais para monitorar a tese de investimento."
        )
    else:
        persp = (
            f"{ticker} apresenta algumas fragilidades de desempenho que merecem atenção. "
            f"Antes de investir, avalie: (1) histórico de distribuições dos últimos 24 meses, "
            f"(2) taxa de vacância atual, (3) qualidade da gestora, (4) prazo dos contratos."
        )

    # Riscos
    riscos = [
        "Taxa Selic alta reduz a atratividade relativa dos FIIs frente à renda fixa",
        "Vacância nos imóveis impacta diretamente a distribuição de rendimentos",
        "Risco de liquidez: volume de negociação pode ser baixo em FIIs menores",
        "Concentração em poucos imóveis ou contratos aumenta o risco específico",
        "Variação cambial afeta FIIs com ativos em moeda estrangeira ou indexados ao dólar",
    ]

    pontos_fortes = list(score.pontos_fortes) or [
        "Renda mensal isenta de IR para pessoa física",
        "Diversificação imobiliária com baixo capital inicial",
    ]
    pontos_fracos = list(score.pontos_fracos) or [
        "Dados de DY e P/VP não disponíveis no plano atual de dados",
    ]

    return RSAnaliseIA(
        resumo_executivo=resumo,
        situacao_financeira=sit_fin,
        qualidade_lucros=qual,
        crescimento=cresc,
        endividamento=endiv,
        dividendos=div_txt,
        perspectivas=persp,
        riscos=riscos,
        pontos_fortes=pontos_fortes,
        pontos_fracos=pontos_fracos,
    )


# ── Gerador de alertas ───────────────────────────────────────────────────────

def _gerar_alertas(
    historico: list[DemonstrativoAnual],
    cotacao: QuoteData,
    valuation: ValuationData | None,
    score: RSScore,
) -> list[RSAlerta]:
    alertas: list[RSAlerta] = []
    anos = sorted(historico, key=lambda d: d.ano)
    ultimo = anos[-1] if anos else None

    def _s(v, default=None):
        if v is None:
            return default
        try:
            f = float(v)
            return default if (f != f or abs(f) == float("inf")) else f
        except Exception:
            return default

    # Críticos
    if ultimo and _s(ultimo.lucro_liquido, 0) <= 0:
        alertas.append(RSAlerta(
            tipo="critico",
            titulo="Empresa em prejuízo",
            descricao=f"O lucro líquido de {ultimo.ano} foi negativo (R$ {_s(ultimo.lucro_liquido, 0)/1e6:.0f}M).",
            categoria="resultado",
        ))

    if ultimo and _s(ultimo.dl_ebitda) is not None and abs(_s(ultimo.dl_ebitda)) > 4:
        alertas.append(RSAlerta(
            tipo="critico",
            titulo="Endividamento elevado",
            descricao=f"DL/EBITDA de {abs(_s(ultimo.dl_ebitda)):.1f}x, acima do limite de conforto (3x).",
            categoria="endividamento",
        ))

    if ultimo and _s(ultimo.liquidez_corrente) is not None and _s(ultimo.liquidez_corrente) < 1.0:
        alertas.append(RSAlerta(
            tipo="critico",
            titulo="Risco de liquidez",
            descricao=f"Liquidez corrente de {_s(ultimo.liquidez_corrente):.2f}x — passivo circulante maior que o ativo circulante.",
            categoria="liquidez",
        ))

    # Atenção
    dl_ebitda = _s(ultimo.dl_ebitda) if ultimo else None
    if dl_ebitda is not None and 3 < abs(dl_ebitda) <= 4:
        alertas.append(RSAlerta(
            tipo="atencao",
            titulo="Dívida acima do ideal",
            descricao=f"DL/EBITDA de {abs(dl_ebitda):.1f}x — atenção ao ritmo de desalavancagem.",
            categoria="endividamento",
        ))

    ml = _s(ultimo.margem_liquida) if ultimo else None
    if ml is not None and 0 < ml < 0.05:
        alertas.append(RSAlerta(
            tipo="atencao",
            titulo="Margem líquida comprimida",
            descricao=f"Margem líquida de {ml*100:.1f}% — pouca folga para adversidades.",
            categoria="resultado",
        ))

    fco_negs = sum(1 for d in anos[-3:] if _s(d.fco, 0) <= 0)
    if fco_negs >= 2:
        alertas.append(RSAlerta(
            tipo="atencao",
            titulo="Geração de caixa operacional fraca",
            descricao=f"FCO negativo em {fco_negs} dos últimos 3 exercícios.",
            categoria="fluxo_caixa",
        ))

    if valuation and valuation.upside_pct is not None and valuation.upside_pct < -0.30:
        alertas.append(RSAlerta(
            tipo="atencao",
            titulo="Ativo possivelmente superavaliado",
            descricao=f"Preço atual está {abs(valuation.upside_pct)*100:.0f}% acima do preço justo estimado.",
            categoria="valuation",
        ))

    # Positivos
    if score.score_total >= 700:
        alertas.append(RSAlerta(
            tipo="positivo",
            titulo="Empresa de alta qualidade",
            descricao=f"Score RS Invest de {score.score_total}/1000 — {score.nota_geral}.",
            categoria="score",
        ))

    roe = _s(ultimo.roe) if ultimo else None
    if roe and roe >= 0.20:
        alertas.append(RSAlerta(
            tipo="positivo",
            titulo="ROE excelente",
            descricao=f"Retorno sobre patrimônio de {roe*100:.1f}% no último exercício.",
            categoria="resultado",
        ))

    if valuation and valuation.upside_pct is not None and valuation.upside_pct >= 0.30:
        alertas.append(RSAlerta(
            tipo="positivo",
            titulo="Oportunidade de valuation",
            descricao=f"Potencial de valorização de {valuation.upside_pct*100:.0f}% segundo modelos combinados.",
            categoria="valuation",
        ))

    dy = _s(cotacao.preco_lucro)  # placeholder — dy vem do fundamentos
    if cotacao.lpa and cotacao.preco_atual and cotacao.preco_atual > 0:
        lpa = _s(cotacao.lpa)
        if lpa and lpa > 0:
            pl = cotacao.preco_atual / lpa
            if pl <= 10:
                alertas.append(RSAlerta(
                    tipo="positivo",
                    titulo="Valuation atrativo (P/L)",
                    descricao=f"P/L de {pl:.1f}x — empresa negociada a múltiplo baixo.",
                    categoria="valuation",
                ))

    # Info
    alertas.append(RSAlerta(
        tipo="info",
        titulo="Dados atualizados",
        descricao="Análise baseada nos dados mais recentes do CVM, B3 e brapi.dev.",
        categoria="sistema",
    ))

    return alertas


# ── Gerador de análise textual ─────────────────────────────────────────────────

def _gerar_analise(
    ticker: str,
    empresa: str,
    historico: list[DemonstrativoAnual],
    cotacao: QuoteData,
    score: RSScore,
    valuation: ValuationData | None,
) -> RSAnaliseIA:
    anos = sorted(historico, key=lambda d: d.ano)
    ultimo = anos[-1] if anos else None
    ano_ref = ultimo.ano if ultimo else "N/D"

    def _s(v, default=0.0):
        if v is None:
            return default
        try:
            f = float(v)
            return default if (f != f or abs(f) == float("inf")) else f
        except Exception:
            return default

    def _pct(v, default=None):
        r = _s(v, default)
        return f"{r*100:.1f}%" if r is not None else "N/D"

    def _bi(v):
        r = _s(v, 0)
        if abs(r) >= 1e9:
            return f"R$ {r/1e9:.1f}B"
        if abs(r) >= 1e6:
            return f"R$ {r/1e6:.0f}M"
        return f"R$ {r:.0f}"

    nota = score.nota_geral

    # Resumo executivo
    nota_adj = {
        "Excelente": "excepcionais",
        "Muito Bom": "sólidos",
        "Bom": "satisfatórios",
        "Regular": "mistos",
        "Fraco": "preocupantes",
    }.get(nota, "a serem avaliados")

    roe_str = _pct(ultimo.roe if ultimo else None)
    ml_str = _pct(ultimo.margem_liquida if ultimo else None)

    resumo = (
        f"{empresa} ({ticker}) apresenta fundamentos {nota_adj} com Score RS Invest de "
        f"{score.score_total}/1000 ({nota}). "
    )
    if ultimo and _s(ultimo.lucro_liquido, 0) > 0:
        resumo += (
            f"Em {ano_ref}, a empresa registrou receita líquida de {_bi(ultimo.receita_liquida)} "
            f"com margem líquida de {ml_str} e ROE de {roe_str}. "
        )
    else:
        resumo += f"No último exercício ({ano_ref}), a empresa reportou resultado negativo, demandando atenção especial. "

    if valuation and valuation.upside_pct is not None:
        sinal = "+" if valuation.upside_pct >= 0 else ""
        resumo += (
            f"O modelo combinado de valuation indica potencial de {sinal}{valuation.upside_pct*100:.0f}% "
            f"em relação ao preço atual de R$ {cotacao.preco_atual:.2f}."
        )

    # Situação financeira
    liq = _s(ultimo.liquidez_corrente if ultimo else None)
    dl_eb = _s(ultimo.dl_ebitda if ultimo else None)
    fco_pos = sum(1 for d in anos[-3:] if _s(d.fco, 0) > 0)

    if liq >= 1.5:
        sit_liq = f"A liquidez corrente de {liq:.2f}x indica posição confortável de curto prazo."
    elif liq >= 1.0:
        sit_liq = f"A liquidez corrente de {liq:.2f}x está no limite aceitável, exigindo acompanhamento."
    else:
        sit_liq = f"A liquidez corrente de {liq:.2f}x sinaliza pressão no capital de giro de curto prazo."

    if abs(dl_eb) <= 2:
        sit_div = f"O endividamento é controlado, com DL/EBITDA de {abs(dl_eb):.1f}x."
    elif abs(dl_eb) <= 4:
        sit_div = f"A alavancagem merece atenção, com DL/EBITDA de {abs(dl_eb):.1f}x."
    else:
        sit_div = f"O endividamento elevado (DL/EBITDA {abs(dl_eb):.1f}x) representa risco relevante."

    situacao_fin = f"{sit_liq} {sit_div} O fluxo de caixa operacional foi positivo em {fco_pos} dos últimos 3 exercícios."

    # Qualidade dos lucros
    roe_media = sum(_s(d.roe, 0) for d in anos[-3:]) / max(len(anos[-3:]), 1)
    ml_media = sum(_s(d.margem_liquida, 0) for d in anos[-3:]) / max(len(anos[-3:]), 1)

    if roe_media >= 0.20:
        qual_roe = f"O ROE médio de {roe_media*100:.1f}% nos últimos 3 anos coloca a empresa no grupo das mais rentáveis do mercado."
    elif roe_media >= 0.10:
        qual_roe = f"O ROE médio de {roe_media*100:.1f}% nos últimos 3 anos indica rentabilidade razoável sobre o patrimônio."
    else:
        qual_roe = f"O ROE médio de {roe_media*100:.1f}% nos últimos 3 anos está abaixo do custo de capital típico."

    if ml_media >= 0.15:
        qual_ml = f"A margem líquida média de {ml_media*100:.1f}% reflete eficiência operacional e poder de precificação."
    elif ml_media >= 0.05:
        qual_ml = f"A margem líquida média de {ml_media*100:.1f}% é moderada e sujeita a compressão em cenários adversos."
    else:
        qual_ml = f"A margem líquida média de {ml_media*100:.1f}% é muito estreita, exigindo volume elevado para resultados consistentes."

    qualidade = f"{qual_roe} {qual_ml}"

    # Crescimento
    if len(anos) >= 2:
        n = len(anos) - 1
        rec0, recN = _s(anos[0].receita_liquida, 1), _s(anos[-1].receita_liquida, 1)
        if rec0 > 0:
            cagr_r = ((recN / rec0) ** (1 / n) - 1) if n > 0 else 0
        else:
            cagr_r = 0
        cagr_str = f"{cagr_r*100:+.1f}%/ano"

        if cagr_r >= 0.10:
            cresc_txt = (
                f"{empresa} cresceu a um CAGR de receita de {cagr_str} no período analisado ({anos[0].ano}–{anos[-1].ano}), "
                f"demonstrando consistente expansão de negócios. "
            )
        elif cagr_r >= 0:
            cresc_txt = (
                f"A receita cresceu a ritmo modesto ({cagr_str}) entre {anos[0].ano} e {anos[-1].ano}. "
                f"Expansão de margens ou ganhos de eficiência podem compensar o crescimento comedido. "
            )
        else:
            cresc_txt = (
                f"A receita encolheu a {cagr_str} no período analisado, indicando vento contrário no segmento ou perda de participação. "
            )
    else:
        cresc_txt = "Dados de crescimento insuficientes para análise de longo prazo. "

    if len(anos) >= 3:
        pl0, plN = _s(anos[0].patrimonio_liquido, 1), _s(anos[-1].patrimonio_liquido, 1)
        if pl0 > 0:
            cagr_pl = ((plN / pl0) ** (1 / (len(anos) - 1)) - 1) if len(anos) > 1 else 0
            cresc_txt += f"O patrimônio líquido cresceu a {cagr_pl*100:+.1f}%/ano no mesmo período."
    crescimento = cresc_txt

    # Endividamento
    dl_historico = [(d.ano, _s(d.dl_ebitda)) for d in anos if _s(d.dl_ebitda) is not None]
    if dl_historico:
        primeiro = dl_historico[0]
        ult_dl = dl_historico[-1]
        evolucao = "reduzindo" if ult_dl[1] < primeiro[1] else "aumentando"
        endiv_txt = (
            f"A dívida líquida em relação ao EBITDA estava em {abs(ult_dl[1]):.1f}x em {ult_dl[0]}, "
            f"{evolucao} em relação a {abs(primeiro[1]):.1f}x em {primeiro[0]}. "
        )
        if abs(ult_dl[1]) <= 2:
            endiv_txt += "O nível de alavancagem é confortável e preserva flexibilidade financeira."
        elif abs(ult_dl[1]) <= 4:
            endiv_txt += "Recomenda-se acompanhar o ritmo de desalavancagem nos próximos trimestres."
        else:
            endiv_txt += "O elevado endividamento limita a capacidade de investimento e aumenta o risco financeiro."
    else:
        endiv_txt = "Dados de endividamento não disponíveis para análise detalhada."
    endividamento = endiv_txt

    # Dividendos
    pl_atual = _s(cotacao.preco_lucro)
    lpa = _s(cotacao.lpa)
    if lpa and lpa > 0 and cotacao.preco_atual > 0:
        pl = cotacao.preco_atual / lpa
        div_txt = f"Com P/L de {pl:.1f}x, o ativo apresenta valuation de múltiplo {"atrativo" if pl <= 15 else "moderado" if pl <= 25 else "elevado"}. "
    else:
        div_txt = ""

    fcl_pos = sum(1 for d in anos[-3:] if _s(d.fcl, 0) > 0)
    div_txt += (
        f"A geração de caixa livre foi positiva em {fcl_pos} dos últimos 3 exercícios, "
        f"{"sustentando" if fcl_pos >= 2 else "limitando"} a capacidade de distribuição de dividendos."
    )
    dividendos = div_txt

    # Perspectivas
    if nota in ("Excelente", "Muito Bom"):
        perspectivas = (
            f"Com fundamentos {nota_adj} e Score RS Invest de {score.score_total}/1000, "
            f"{empresa} está bem posicionada para continuar criando valor para acionistas. "
            f"Monitorar: alavancagem, crescimento orgânico e governança corporativa."
        )
    elif nota == "Bom":
        perspectivas = (
            f"Os fundamentos de {empresa} são sólidos, mas há espaço para melhoria em eficiência e crescimento. "
            f"Pontos de atenção: evolução das margens e capacidade de reinvestimento."
        )
    else:
        perspectivas = (
            f"{empresa} enfrenta desafios relevantes que demandam turnaround operacional ou financeiro. "
            f"Reavalie a tese de investimento com base na evolução dos resultados trimestrais."
        )

    # Riscos
    riscos = []
    if dl_eb > 3.5:
        riscos.append(f"Endividamento elevado (DL/EBITDA {dl_eb:.1f}x) pode comprometer dividend yield e investimentos")
    if ml_media < 0.05:
        riscos.append("Margem líquida estreita deixa pouco espaço para absorver custos extraordinários")
    if roe_media < 0.08:
        riscos.append("ROE abaixo do custo de capital pode indicar destruição de valor")
    if cotacao.preco_lucro and _s(cotacao.preco_lucro) > 35:
        riscos.append(f"P/L elevado ({_s(cotacao.preco_lucro):.1f}x) exige crescimento acelerado de lucros para justificar o preço")
    if fco_pos < 2:
        riscos.append("Geração de caixa operacional inconsistente aumenta dependência de financiamento externo")
    riscos.append("Variações macroeconômicas (Selic, câmbio, inflação) podem impactar resultados")
    riscos.append("Risco regulatório e competição setorial inerentes ao setor")

    # Pontos fortes e fracos
    pontos_fortes = list(score.pontos_fortes) or ["Dados insuficientes para listar pontos fortes."]
    pontos_fracos = list(score.pontos_fracos) or ["Nenhum ponto fraco identificado nos dados disponíveis."]

    return RSAnaliseIA(
        resumo_executivo=resumo,
        situacao_financeira=situacao_fin,
        qualidade_lucros=qualidade,
        crescimento=crescimento,
        endividamento=endividamento,
        dividendos=dividendos,
        perspectivas=perspectivas,
        riscos=riscos[:5],
        pontos_fortes=pontos_fortes,
        pontos_fracos=pontos_fracos,
    )


# ── Endpoint principal ─────────────────────────────────────────────────────────

@router.get("/{ticker}", response_model=RSAnalisaData)
async def rs_analisa(ticker: str) -> RSAnalisaData:
    """
    RS Invest Analytics — dossier completo de um ativo B3.

    Agrega em paralelo:
    • Cotação tempo-real (brapi.dev)
    • Dados cadastrais B3 (segmento, governança, CNPJ)
    • Índices B3 em que o ativo está presente
    • Fundamentos históricos (CVM DFP)
    • Valuation combinado (Graham + DCF + P/L + P/VP)
    • Histórico mensal 1 ano (para mini-gráfico)
    • Score RS Invest 0-1000
    • Alertas automáticos
    • Análise inteligente em português
    """
    from datetime import datetime
    from ..etl.b3.catalog import buscar_empresa_por_ticker
    from ..etl.b3.indices import pertence_a_indices

    t = ticker.upper()

    # ── Busca paralela de dados ──────────────────────────────────────────────
    async def _get_cotacao():
        try:
            return await _provider.get_cotacao(t)
        except Exception as e:
            raise HTTPException(status_code=404, detail=f"Ativo '{t}' não encontrado: {e}")

    async def _get_historico():
        try:
            return await _provider.get_historico(t, "1y", "1mo")
        except Exception:
            return []

    async def _get_empresa_b3():
        try:
            return await buscar_empresa_por_ticker(t)
        except Exception:
            return None

    async def _get_indices():
        try:
            return await asyncio.wait_for(pertence_a_indices(t), timeout=10.0)
        except Exception:
            return []

    cotacao, hist_mensal, empresa_b3, indices = await asyncio.gather(
        _get_cotacao(),
        _get_historico(),
        _get_empresa_b3(),
        _get_indices(),
    )

    nome = cotacao.nome_longo or cotacao.nome_curto

    # ── Variação histórica ───────────────────────────────────────────────────
    var_mes = var_ano = None
    if hist_mensal and len(hist_mensal) >= 2:
        p_atual = cotacao.preco_atual
        p_mes = hist_mensal[-2].fechamento if len(hist_mensal) >= 2 else None
        p_ano = hist_mensal[0].fechamento if hist_mensal else None
        if p_mes and p_mes > 0:
            var_mes = (p_atual - p_mes) / p_mes
        if p_ano and p_ano > 0:
            var_ano = (p_atual - p_ano) / p_ano

    hist_dict = [
        {
            "data": p.data,
            "fechamento": p.fechamento,
            "abertura": p.abertura,
            "maximo": p.maximo,
            "minimo": p.minimo,
            "volume": p.volume,
        }
        for p in hist_mensal
    ]

    # ── Dados cadastrais B3 ───────────────────────────────────────────────────
    governanca = cnpj = website = data_listagem = segmento_b3 = None
    if empresa_b3:
        governanca = empresa_b3.get("segment") or empresa_b3.get("market")
        cnpj = empresa_b3.get("cnpj")
        website = empresa_b3.get("website")
        data_listagem = empresa_b3.get("dateListing")
        segmento_b3 = empresa_b3.get("segment")

    setor = cotacao.setor
    subsetor = cotacao.subsetor
    if empresa_b3 and not setor:
        classif = empresa_b3.get("industryClassification") or ""
        partes = [p.strip() for p in classif.split("/") if p.strip()]
        setor = partes[0] if partes else None
        subsetor = partes[1] if len(partes) > 1 else None

    # ── Detectar FII ─────────────────────────────────────────────────────────
    is_fii = _is_fii(t, nome, setor)

    if is_fii:
        # Busca summaryProfile para obter tipo e descrição do FII
        profile = await _buscar_summary_profile(t)
        fii_tipo = profile.get("tipo") or subsetor
        fii_descricao = profile.get("descricao") or ""
        if not setor:
            setor = profile.get("setor") or "Fundos Imobiliários"

        score = _calcular_score_fii(cotacao, indices, hist_dict)
        alertas = _gerar_alertas_fii(cotacao, indices, score, hist_dict, fii_tipo)
        analise = _gerar_analise_fii(
            t, nome, cotacao, score, indices, hist_dict, fii_tipo, fii_descricao
        )

        return RSAnalisaData(
            ticker=t,
            timestamp=datetime.utcnow().isoformat() + "Z",
            is_fii=True,
            fii_tipo=fii_tipo,
            fii_descricao=fii_descricao or None,
            empresa=nome,
            setor=setor,
            subsetor=fii_tipo,
            segmento_b3=segmento_b3,
            governanca=governanca,
            cnpj=cnpj,
            website=website,
            data_listagem=data_listagem,
            indices=indices,
            cotacao=cotacao,
            var_mes=var_mes,
            var_ano=var_ano,
            historico_mensal=hist_dict,
            score=score,
            fundamentos=None,   # FIIs não têm DFP no formato de ações
            valuation=None,     # FIIs não têm valuation tradicional
            alertas=alertas,
            analise=analise,
        )

    # ── AÇÃO: Fundamentos + Valuation (dependem da cotação) ──────────────────
    resultado_cvm = await buscar_fundamentos_cvm(t, nome)

    historico_calc: list[DemonstrativoAnual] = []
    fundamentos_data: FundamentosData | None = None
    valuation_data: ValuationData | None = None
    cagrs: dict = {}

    if resultado_cvm:
        historico_calc = calcular_demonstrativos(resultado_cvm["anos"])
        sinais = calcular_sinais(historico_calc)
        cagrs = calcular_cagrs(historico_calc)
        fundamentos_data = FundamentosData(
            ticker=t,
            cd_cvm=resultado_cvm.get("cd_cvm"),
            historico=historico_calc,
            pl_atual=cotacao.preco_lucro,
            sinais=sinais,
            cagr_receita=cagrs.get("cagr_receita"),
            cagr_lucro=cagrs.get("cagr_lucro"),
            cagr_pl=cagrs.get("cagr_pl"),
        )
        try:
            valuation_data = calcular_valuation(
                ticker=t,
                preco_atual=cotacao.preco_atual,
                market_cap=cotacao.market_cap,
                historico=historico_calc,
                cagr_receita=cagrs.get("cagr_receita"),
                cagr_lucro=cagrs.get("cagr_lucro"),
            )
        except Exception:
            valuation_data = None

    upside_graham = upside_dcf = None
    if valuation_data:
        upside_graham = next(
            (m.upside_pct for m in valuation_data.metodos if "Graham" in m.nome), None
        )
        upside_dcf = next(
            (c.upside_pct for c in valuation_data.cenarios if c.nome == "Base"), None
        )

    score = calcular_score_rs(
        historico=historico_calc,
        preco_atual=cotacao.preco_atual,
        preco_lucro=cotacao.preco_lucro,
        dy_atual=None,
        upside_graham=upside_graham,
        upside_dcf=upside_dcf,
        governanca_b3=governanca,
        preco_max_52s=cotacao.cinquenta_dois_semanas_alta,
        preco_min_52s=cotacao.cinquenta_dois_semanas_baixa,
    )

    alertas = _gerar_alertas(historico_calc, cotacao, valuation_data, score)
    analise = _gerar_analise(t, nome, historico_calc, cotacao, score, valuation_data)

    return RSAnalisaData(
        ticker=t,
        timestamp=datetime.utcnow().isoformat() + "Z",
        is_fii=False,
        empresa=nome,
        setor=setor,
        subsetor=subsetor,
        segmento_b3=segmento_b3,
        governanca=governanca,
        cnpj=cnpj,
        website=website,
        data_listagem=data_listagem,
        indices=indices,
        cotacao=cotacao,
        var_mes=var_mes,
        var_ano=var_ano,
        historico_mensal=hist_dict,
        score=score,
        fundamentos=fundamentos_data,
        valuation=valuation_data,
        alertas=alertas,
        analise=analise,
    )
