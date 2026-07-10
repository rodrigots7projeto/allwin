"""
Rotas da API REST — Fase 1: cotação e histórico; Fase 2: fundamentos CVM.
"""
from typing import Annotated

from fastapi import APIRouter, HTTPException, Query

from ..data.brapi import BrapiProvider
from ..data.cvm import buscar_fundamentos_cvm
from ..data.provider import PontoHistorico, QuoteData
from ..financials.indicators import calcular_cagrs, calcular_demonstrativos, calcular_sinais
from ..financials.models import FundamentosData
from ..valuation.engine import calcular_valuation
from ..valuation.models import ValuationData

router = APIRouter()
_provider = BrapiProvider()

# Tickers disponíveis sem token brapi para desenvolvimento
TICKERS_TESTE = ["PETR4", "VALE3", "ITUB4", "MGLU3"]

# Tickers populares da B3 para o painel de mercado
TICKERS_ACOES = [
    "PETR4", "VALE3", "ITUB4", "MGLU3",
    "BBDC4", "BBAS3", "WEGE3", "RENT3",
    "LREN3", "SUZB3", "RDOR3", "PRIO3",
]

TICKERS_FIIS = [
    "KNRI11", "HGLG11", "XPLG11", "BTLG11",
    "XPML11", "VISC11", "KNCR11", "KNSC11",
    "RBRR11", "MXRF11",
]

TICKERS_POPULARES = TICKERS_ACOES + TICKERS_FIIS


@router.get("/tickers-teste")
async def tickers_teste() -> dict:
    """Retorna os tickers gratuitos disponíveis no modo de desenvolvimento."""
    return {
        "tickers": TICKERS_TESTE,
        "nota": (
            "Estes 4 tickers funcionam sem BRAPI_TOKEN. "
            "Configure o token no .env para acesso a todos os ativos da B3."
        ),
    }


@router.get("/mercado", response_model=list[QuoteData])
async def mercado(
    tickers: Annotated[
        str,
        Query(description="Tickers separados por vírgula. Padrão: top ações + FIIs."),
    ] = "",
    tipo: Annotated[
        str,
        Query(description="Filtro: 'acoes' | 'fiis' | '' (todos)"),
    ] = "",
) -> list[QuoteData]:
    """
    Retorna cotação simultânea de múltiplos ativos.
    Sem token: limitado a PETR4, VALE3, ITUB4, MGLU3.
    Com BRAPI_TOKEN: ações + FIIs da B3.
    """
    from ..config import settings
    if tickers:
        lista = [t.strip().upper() for t in tickers.split(",") if t.strip()]
    elif not settings.brapi_token:
        lista = TICKERS_TESTE
    elif tipo == "acoes":
        lista = TICKERS_ACOES
    elif tipo == "fiis":
        lista = TICKERS_FIIS
    else:
        lista = TICKERS_POPULARES
    try:
        return await _provider.get_multi_cotacao(lista)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.get("/cotacao/{ticker}", response_model=QuoteData)
async def cotacao(ticker: str) -> QuoteData:
    """
    Retorna cotação atual de um ativo.
    Tickers de teste (sem token): PETR4, VALE3, ITUB4, MGLU3.
    """
    try:
        return await _provider.get_cotacao(ticker.upper())
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=429, detail=str(exc)) from exc


@router.get("/historico/{ticker}", response_model=list[PontoHistorico])
async def historico(
    ticker: str,
    range: Annotated[str, Query(description="Período: 1mo | 3mo | 6mo | 1y | 2y | 5y")] = "5y",
    interval: Annotated[str, Query(description="Intervalo: 1d | 1wk | 1mo")] = "1mo",
) -> list[PontoHistorico]:
    """
    Retorna histórico de preços de um ativo.
    Padrão: 5 anos, intervalos mensais.
    No plano gratuito da brapi, tickers além dos 4 livres têm range máximo de 3mo.
    Nesses casos, o endpoint cai automaticamente para 3mo.
    """
    import httpx
    t = ticker.upper()
    try:
        return await _provider.get_historico(t, range, interval)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=429, detail=str(exc)) from exc
    except httpx.HTTPStatusError as exc:
        if exc.response.status_code == 400:
            # Plano básico brapi: range solicitado não disponível → cai para 3mo
            try:
                return await _provider.get_historico(t, "3mo", "1d")
            except Exception:
                return []
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.get("/fundamentos/{ticker}", response_model=FundamentosData)
async def fundamentos(ticker: str) -> FundamentosData:
    """
    Retorna dados fundamentalistas históricos do ativo (fonte: CVM DFP).
    Inclui DRE, Balanço, DFC, indicadores calculados e sinais versus média histórica.
    """
    t = ticker.upper()

    # Busca cotação para obter o nome da empresa (necessário para lookup no CVM)
    try:
        cotacao = await _provider.get_cotacao(t)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=429, detail=str(exc)) from exc

    nome = cotacao.nome_longo or cotacao.nome_curto
    resultado = await buscar_fundamentos_cvm(t, nome)

    if resultado is None:
        raise HTTPException(
            status_code=404,
            detail=f"Dados fundamentalistas não encontrados para '{t}' no CVM.",
        )

    historico_calc = calcular_demonstrativos(resultado["anos"])
    sinais = calcular_sinais(historico_calc)
    cagrs = calcular_cagrs(historico_calc)

    return FundamentosData(
        ticker=t,
        cd_cvm=resultado.get("cd_cvm"),
        historico=historico_calc,
        pl_atual=cotacao.preco_lucro,
        sinais=sinais,
        cagr_receita=cagrs.get("cagr_receita"),
        cagr_lucro=cagrs.get("cagr_lucro"),
        cagr_pl=cagrs.get("cagr_pl"),
    )


@router.get("/b3/empresa/{ticker}")
async def b3_empresa(ticker: str) -> dict:
    """
    Retorna dados cadastrais da empresa diretamente da B3:
    codeCVM, CNPJ, segmento de mercado, nível de governança,
    classificação setorial, website e todos os tickers listados.

    Fonte: sistemaswebb3-listados.b3.com.br (API pública da B3).
    """
    from ..etl.b3.catalog import buscar_empresa_por_ticker
    dados = await buscar_empresa_por_ticker(ticker.upper())
    if not dados:
        raise HTTPException(status_code=404, detail=f"Empresa não encontrada para o ticker '{ticker.upper()}'.")
    return dados


@router.get("/b3/indice/{codigo}")
async def b3_indice(codigo: str) -> dict:
    """
    Retorna a composição de um índice B3 com os pesos percentuais de cada ativo.

    Índices disponíveis: IBOV, SMLL, MIDL, IDIV, IFIX, MLCX, ITAG, IGCT,
    IMAT, ICON, IFNC, UTIL, IMOB, INDX, IBRA.

    Fonte: cotacao.b3.com.br (API pública da B3).
    """
    from ..etl.b3.indices import buscar_composicao_indice
    composicao = await buscar_composicao_indice(codigo.upper())
    if not composicao:
        raise HTTPException(status_code=404, detail=f"Índice '{codigo.upper()}' não encontrado ou sem dados.")
    return {
        "indice": codigo.upper(),
        "total_ativos": len(composicao),
        "composicao": composicao,
    }


@router.get("/b3/indices-do-ticker/{ticker}")
async def b3_indices_do_ticker(ticker: str) -> dict:
    """
    Retorna em quais índices B3 um ticker está presente.
    Útil para exibir badges IBOV / IDIV / IFIX / SMLL no card de ativo.
    Primeira chamada pode demorar ~5s (carrega todos os índices); as seguintes usam cache.
    """
    import asyncio
    from ..etl.b3.indices import pertence_a_indices
    try:
        indices = await asyncio.wait_for(pertence_a_indices(ticker.upper()), timeout=20.0)
    except asyncio.TimeoutError:
        indices = []
    return {"ticker": ticker.upper(), "indices": indices}


@router.get("/alpha/stock/{symbol}")
async def alpha_stock(symbol: str) -> dict:
    """
    Portfólio completo via Alpha Vantage — 5 endpoints combinados, tudo em BRL:
      • CURRENCY_EXCHANGE_RATE  → taxa USD/BRL em tempo real
      • GLOBAL_QUOTE            → cotação atual
      • OVERVIEW                → fundamentos completos (P/L, ROE, margens, beta…)
      • TIME_SERIES_DAILY_ADJ   → histórico ajustado 90 dias com SMA7/21/50
      • EARNINGS                → EPS trimestral vs estimativa (últimos 8 trimestres)

    Cache inteligente por tipo: FX 10min · QUOTE 5min · OVERVIEW 24h · TS 30min · EARN 24h
    Plano gratuito Alpha Vantage: 25 req/dia.  Exemplos: IBM, AAPL, TSLA, MSFT, NVDA.
    """
    from ..data.alpha_vantage import get_alpha_full
    try:
        return (await get_alpha_full(symbol.upper())).model_dump()
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=429, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.get("/valuation/{ticker}", response_model=ValuationData)
async def valuation(ticker: str) -> ValuationData:
    """
    Calcula o preço justo estimado do ativo usando múltiplos métodos:
      • Graham (√22,5 × LPA × VPA)
      • P/L    (LPA × múltiplo-alvo)
      • P/VP   (VPA × múltiplo-alvo)
      • DCF    (FCL projetado por 5 anos + valor terminal)

    Retorna 3 cenários (Pessimista / Base / Otimista) e um veredicto:
    SUBAVALIADA | JUSTA | SUPERAVALIADA.
    """
    t = ticker.upper()

    # Cotação: precisamos do preço atual e do market cap para calcular shares
    try:
        cotacao = await _provider.get_cotacao(t)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=429, detail=str(exc)) from exc

    # Dados fundamentalistas do CVM (reutiliza o mesmo flow do /fundamentos)
    nome = cotacao.nome_longo or cotacao.nome_curto
    resultado_cvm = await buscar_fundamentos_cvm(t, nome)

    if resultado_cvm is None:
        raise HTTPException(
            status_code=404,
            detail=f"Dados do CVM não encontrados para '{t}'. Sem dados para valuation.",
        )

    historico_calc = calcular_demonstrativos(resultado_cvm["anos"])
    cagrs = calcular_cagrs(historico_calc)

    return calcular_valuation(
        ticker=t,
        preco_atual=cotacao.preco_atual,
        market_cap=cotacao.market_cap,
        historico=historico_calc,
        cagr_receita=cagrs.get("cagr_receita"),
        cagr_lucro=cagrs.get("cagr_lucro"),
    )
