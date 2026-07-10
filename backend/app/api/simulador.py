"""
Simulador de Investimentos — RS Invest Analytics.
Calcula resultado real de uma operação de compra/venda usando histórico Brapi.
O preço de compra e de venda são buscados automaticamente do histórico mensal.
"""
from datetime import date
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from ..data.brapi import BrapiProvider

router = APIRouter(tags=["Simulador"])
_provider = BrapiProvider()


# ── Modelos ───────────────────────────────────────────────────────────────────

class SimuladorInput(BaseModel):
    ticker: str
    data_compra: date
    data_venda: Optional[date] = None   # None = posição aberta (usa preço atual)
    quantidade: float = Field(gt=0)
    corretagem: float = Field(default=0.0, ge=0)
    dividendos_recebidos: float = Field(default=0.0, ge=0)
    jcp_recebido: float = Field(default=0.0, ge=0)


class PontoTimeline(BaseModel):
    mes: str
    data: str
    preco: float
    patrimonio: float
    lucro_acumulado: float
    rentabilidade_pct: float


class ResumoSimulacao(BaseModel):
    ticker: str
    empresa: str
    # Compra
    data_compra: str
    preco_compra: float
    preco_compra_data_usada: str   # data exata do fechamento usado como referência
    quantidade: float
    valor_investido: float
    corretagem: float
    # Saída
    data_saida: str
    preco_saida: float
    preco_saida_data_usada: str
    posicao_aberta: bool
    valor_bruto: float
    # Resultados
    lucro_acao: float
    dividendos_recebidos: float
    jcp_recebido: float
    yield_total_pct: float
    lucro_total: float
    imposto_estimado: float
    resultado_final: float
    # Rentabilidade
    rentabilidade_pct: float
    rentabilidade_anual_pct: float
    # Período
    periodo_dias: int
    periodo_anos: float


class SimuladorData(BaseModel):
    resumo: ResumoSimulacao
    timeline: list[PontoTimeline]
    serie_preco: list[dict]
    serie_patrimonio: list[dict]
    aviso: Optional[str] = None


# ── Helpers ───────────────────────────────────────────────────────────────────

def _preco_mais_proximo(historico, data_alvo: date):
    """Retorna (fechamento, data) do ponto mais próximo à data alvo."""
    if not historico:
        return None, None
    p = min(historico, key=lambda x: abs((x.data.date() - data_alvo).days))
    return p.fechamento, p.data.date()


# ── Endpoint ──────────────────────────────────────────────────────────────────

@router.post("/simulador", response_model=SimuladorData)
async def simular_investimento(inp: SimuladorInput) -> SimuladorData:
    ticker = inp.ticker.upper().strip()

    try:
        cotacao, historico = await _fetch_dados(ticker)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Erro ao buscar dados: {e}")

    if not historico:
        raise HTTPException(
            status_code=422,
            detail=(
                f"Sem dados históricos para {ticker}. "
                "Verifique se o ticker está correto e se o BRAPI_TOKEN está configurado."
            ),
        )

    # ── Preço de compra automático ────────────────────────────────────────────
    preco_compra, data_compra_usada = _preco_mais_proximo(historico, inp.data_compra)
    if preco_compra is None:
        raise HTTPException(status_code=422, detail="Não foi possível determinar o preço de compra para a data informada.")

    # ── Preço de saída automático ─────────────────────────────────────────────
    posicao_aberta = inp.data_venda is None
    data_saida = inp.data_venda or date.today()

    if posicao_aberta:
        preco_saida = cotacao.preco_atual
        data_saida_usada = date.today()
    else:
        preco_saida, data_saida_usada = _preco_mais_proximo(historico, data_saida)
        if preco_saida is None:
            preco_saida = cotacao.preco_atual
            data_saida_usada = date.today()

    # ── Pontos do período para a timeline ────────────────────────────────────
    # Inclui pontos a partir da data_compra_usada até a data_saida_usada
    pontos = [
        p for p in historico
        if data_compra_usada <= p.data.date() <= (data_saida_usada or data_saida)
    ]

    aviso: Optional[str] = None
    dias_diff_compra = abs((data_compra_usada - inp.data_compra).days)
    if dias_diff_compra > 20:
        aviso = (
            f"Não há dados para {inp.data_compra.strftime('%d/%m/%Y')}. "
            f"Usando o fechamento de {data_compra_usada.strftime('%d/%m/%Y')} "
            f"como referência de compra (diferença de {dias_diff_compra} dias). "
            "O histórico mensal pode não cobrir datas muito antigas com o plano atual."
        )

    # ── Cálculos financeiros ──────────────────────────────────────────────────
    custo_base = inp.quantidade * preco_compra
    valor_investido = custo_base + inp.corretagem
    valor_bruto = inp.quantidade * preco_saida
    lucro_acao = valor_bruto - custo_base
    proventos = inp.dividendos_recebidos + inp.jcp_recebido
    lucro_total = lucro_acao + proventos
    imposto_estimado = max(0.0, lucro_acao * 0.15) if lucro_acao > 0 else 0.0
    resultado_final = lucro_total - imposto_estimado - inp.corretagem
    rent_pct = lucro_total / valor_investido if valor_investido > 0 else 0.0
    yield_pct = proventos / valor_investido if valor_investido > 0 else 0.0

    periodo_dias = max(1, (data_saida - inp.data_compra).days)
    periodo_anos = periodo_dias / 365.25
    rent_anual = (1 + rent_pct) ** (1 / periodo_anos) - 1 if periodo_anos > 0 else 0.0

    # ── Timeline mensal ───────────────────────────────────────────────────────
    timeline: list[PontoTimeline] = []
    for p in pontos:
        pat = inp.quantidade * p.fechamento
        lucro = pat - custo_base
        rent = (pat - valor_investido) / valor_investido if valor_investido > 0 else 0.0
        timeline.append(PontoTimeline(
            mes=p.data.strftime("%Y-%m"),
            data=p.data.strftime("%Y-%m-%d"),
            preco=round(p.fechamento, 2),
            patrimonio=round(pat, 2),
            lucro_acumulado=round(lucro, 2),
            rentabilidade_pct=round(rent * 100, 2),
        ))

    # ── Séries para gráficos ──────────────────────────────────────────────────
    serie_preco: list[dict] = [
        {"data": data_compra_usada.isoformat(), "preco": preco_compra, "referencia": "compra"}
    ]
    serie_patrimonio: list[dict] = [
        {"data": data_compra_usada.isoformat(), "patrimonio": round(custo_base, 2),
         "lucro": 0.0, "investido": round(valor_investido, 2)}
    ]
    for p in pontos:
        pat = round(inp.quantidade * p.fechamento, 2)
        serie_preco.append({
            "data": p.data.strftime("%Y-%m-%d"),
            "preco": round(p.fechamento, 2),
            "referencia": None,
        })
        serie_patrimonio.append({
            "data": p.data.strftime("%Y-%m-%d"),
            "patrimonio": pat,
            "lucro": round(pat - custo_base, 2),
            "investido": round(valor_investido, 2),
        })

    resumo = ResumoSimulacao(
        ticker=ticker,
        empresa=cotacao.nome_longo or cotacao.nome_curto,
        data_compra=inp.data_compra.isoformat(),
        preco_compra=round(preco_compra, 2),
        preco_compra_data_usada=data_compra_usada.isoformat(),
        quantidade=inp.quantidade,
        valor_investido=round(valor_investido, 2),
        corretagem=inp.corretagem,
        data_saida=data_saida.isoformat(),
        preco_saida=round(preco_saida, 2),
        preco_saida_data_usada=(data_saida_usada or data_saida).isoformat(),
        posicao_aberta=posicao_aberta,
        valor_bruto=round(valor_bruto, 2),
        lucro_acao=round(lucro_acao, 2),
        dividendos_recebidos=inp.dividendos_recebidos,
        jcp_recebido=inp.jcp_recebido,
        yield_total_pct=round(yield_pct * 100, 4),
        lucro_total=round(lucro_total, 2),
        imposto_estimado=round(imposto_estimado, 2),
        resultado_final=round(resultado_final, 2),
        rentabilidade_pct=round(rent_pct * 100, 4),
        rentabilidade_anual_pct=round(rent_anual * 100, 4),
        periodo_dias=periodo_dias,
        periodo_anos=round(periodo_anos, 2),
    )

    return SimuladorData(
        resumo=resumo,
        timeline=timeline,
        serie_preco=serie_preco,
        serie_patrimonio=serie_patrimonio,
        aviso=aviso,
    )


async def _fetch_dados(ticker: str):
    import asyncio
    return await asyncio.gather(
        _provider.get_cotacao(ticker),
        _provider.get_historico(ticker, range="5y", interval="1mo"),
    )
