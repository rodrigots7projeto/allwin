"""
Criptomoedas — análise inteligente.

Fontes:
  - Mercado Bitcoin v4 : preço em tempo real (BRL)
  - CoinGecko v3       : OHLCV histórico, ATH/ATL, market data, dev data
  - alternative.me     : Fear & Greed Index

GET /api/v1/cripto/moedas          → lista de moedas suportadas
GET /api/v1/cripto/{simbolo}       → análise completa
"""
from __future__ import annotations

import asyncio
import logging
import time as _time

from fastapi import APIRouter, HTTPException

from ..cripto.mb_provider import MOEDAS, get_fear_greed, get_ticker
from ..cripto import coingecko_provider as cg
from ..cripto import indicators as ind
from ..cripto import score_engine as se

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/cripto", tags=["Criptomoedas"])

_cache: dict[str, dict] = {}
_CACHE_TTL = 5 * 60  # 5 minutos


@router.get("/moedas")
async def listar_moedas() -> dict:
    """Lista de moedas suportadas com metadados."""
    return {
        "moedas": [
            {
                "simbolo":    s,
                "nome":       m["nome"],
                "categoria":  m["categoria"],
                "blockchain": m["blockchain"],
                "cg_id":      cg.CG_IDS.get(s),
            }
            for s, m in MOEDAS.items()
        ]
    }


@router.get("/{simbolo}")
async def analisar_cripto(simbolo: str) -> dict:
    """
    Análise completa: preço, indicadores técnicos, score IA,
    risco, probabilidades, conclusão, ATH/ATL, dev data.
    """
    simbolo = simbolo.upper()
    if simbolo not in MOEDAS:
        raise HTTPException(
            404,
            f"Moeda '{simbolo}' não suportada. Use /api/v1/cripto/moedas para ver a lista.",
        )

    cached = _cache.get(simbolo)
    if cached and (_time.time() - cached.get("_ts", 0)) < _CACHE_TTL:
        return {k: v for k, v in cached.items() if not k.startswith("_")}

    meta = MOEDAS[simbolo]

    # ── Busca paralela: MB ticker + CoinGecko (3 chamadas) + Fear&Greed ────────
    ticker_r, cg_coin_r, cg_chart_r, cg_ohlc_r, fng_r = await asyncio.gather(
        get_ticker(simbolo),
        cg.get_coin_data(simbolo),
        cg.get_market_chart(simbolo, dias=365),
        cg.get_ohlc(simbolo, dias=90),
        get_fear_greed(),
        return_exceptions=True,
    )
    ticker   = None   if isinstance(ticker_r,   Exception) else ticker_r
    cg_coin  = None   if isinstance(cg_coin_r,  Exception) else cg_coin_r
    cg_chart = None   if isinstance(cg_chart_r, Exception) else cg_chart_r
    cg_ohlc  = []     if isinstance(cg_ohlc_r,  Exception) else (cg_ohlc_r or [])
    fng      = None   if isinstance(fng_r,       Exception) else fng_r

    # ── Monta candles mesclados (volume = CoinGecko chart, OHLC = CoinGecko ohlc) ──
    chart_candles = cg.market_chart_para_candles(cg_chart) if cg_chart else []
    ohlc_candles  = cg.ohlc_para_candles_diarios(cg_ohlc)  if cg_ohlc else []
    candles       = cg.mesclar_candles(chart_candles, ohlc_candles) if chart_candles else ohlc_candles

    if not ticker and not candles:
        raise HTTPException(503, "Não foi possível obter dados. Tente novamente em instantes.")

    # ── Arrays para indicadores ─────────────────────────────────────────────────
    closes  = [c["fechamento"] for c in candles] if candles else []
    highs   = [c["maxima"]    for c in candles] if candles else []
    lows    = [c["minima"]    for c in candles] if candles else []
    volumes = [c["volume"]    for c in candles] if candles else []

    # ── Market data (CoinGecko tem prioridade, MB para tempo real) ───────────────
    cg_md  = cg.extrair_market_data(cg_coin) if cg_coin else {}
    cg_dev = cg.extrair_dev_data(cg_coin) if cg_coin else None

    # Preço: MB = mais tempo real, CoinGecko como fallback
    preco    = (ticker or {}).get("preco_atual") or cg_md.get("preco_atual") or (closes[-1] if closes else None)
    if not preco:
        raise HTTPException(503, "Preço indisponível.")

    abertura  = (ticker or {}).get("preco_abertura")
    max_24h   = (ticker or {}).get("preco_max_24h")
    min_24h   = (ticker or {}).get("preco_min_24h")
    vol_24h   = cg_md.get("volume_24h") or (ticker or {}).get("volume_24h")
    spread_b  = (ticker or {}).get("preco_compra")
    spread_s  = (ticker or {}).get("preco_venda")
    spread    = round(spread_s - spread_b, 2) if spread_b and spread_s else None
    spread_pct= round(spread / preco * 100, 4) if spread and preco else None
    var_24h_mb= round((preco - abertura) / abertura * 100, 2) if abertura and abertura > 0 else None

    # Variações: prioriza CoinGecko (mais preciso, inclui histórico 1a)
    var_24h   = cg_md.get("variacao_24h") or var_24h_mb
    var_7d    = cg_md.get("variacao_7d")
    var_30d   = cg_md.get("variacao_30d")
    var_1a    = cg_md.get("variacao_1a")

    # ATH / ATL: CoinGecko é a fonte oficial
    ath_real     = cg_md.get("ath")
    atl_real     = cg_md.get("atl")
    ath_date     = cg_md.get("ath_date")
    atl_date     = cg_md.get("atl_date")
    ath_chg_pct  = cg_md.get("ath_change_pct")
    atl_chg_pct  = cg_md.get("atl_change_pct")

    # Se CoinGecko sem ATH, estima pelo histórico
    ath = ath_real or (max(highs) if highs else None)
    atl = atl_real or (min(lows)  if lows  else None)

    queda_ath = ath_chg_pct or (round((preco - ath) / ath * 100, 2) if ath else None)
    alta_atl  = atl_chg_pct or (round((preco - atl) / atl * 100, 2) if atl else None)

    # Supply e market cap: CoinGecko override do dado estático do MOEDAS dict
    supply_circ  = cg_md.get("supply_circ") or meta.get("supply_circ")
    supply_max   = cg_md.get("supply_max")  or meta.get("supply_max")
    supply_total = cg_md.get("supply_total")
    mktcap  = cg_md.get("market_cap")  or (round(preco * supply_circ, 2) if supply_circ else None)
    fdv     = cg_md.get("fdv")         or (round(preco * supply_max,  2) if supply_max  else None)
    inflacao_anual = meta.get("inflacao_anual")
    if supply_circ and supply_total and supply_total > 0:
        pct_emitido = supply_circ / supply_total * 100
    else:
        pct_emitido = None

    vol_mktcap = round(vol_24h / mktcap, 4) if vol_24h and mktcap and mktcap > 0 else None
    fdv_mktcap = round(fdv / mktcap, 4)     if fdv and mktcap and mktcap > 0     else None

    # ── Indicadores técnicos ────────────────────────────────────────────────────
    rsi_val  = ind.rsi(closes)  if len(closes) > 14  else None
    macd_d   = ind.macd(closes) if len(closes) > 35  else None
    e9       = ind.ema(closes,   9)
    e21      = ind.ema(closes,  21)
    e50      = ind.ema(closes,  50)
    e100     = ind.ema(closes, 100)
    e200     = ind.ema(closes, 200)
    sma200   = ind.sma(closes, 200)
    boll     = ind.bollinger(closes)
    atr_val  = ind.atr(highs, lows, closes) if highs and lows else None
    atr_pct  = round(atr_val / preco * 100, 2) if atr_val and preco else None
    obv_sig  = ind.obv_signal(closes, volumes) if volumes else "neutro"

    vol_30d_avg = sum(volumes[-30:]) / min(30, len(volumes)) if volumes else None
    vol_rel     = round(vol_24h / vol_30d_avg, 2) if vol_24h and vol_30d_avg and vol_30d_avg > 0 else None

    tend  = ind.tendencia(closes) if len(closes) > 21 else {}
    sr    = ind.suportes_resistencias(highs, lows, closes) if highs and lows and closes else {"suportes":[], "resistencias":[]}
    fib   = ind.fibonacci(highs, lows, closes) if highs and lows and closes else {}
    vol_d = ind.volatilidade(closes)
    rent  = ind.rentabilidade(candles) if candles else {}
    probs = ind.probabilidades(closes, vol_d.get("vol_30d_pct"))

    # Rentabilidade histórica: CoinGecko > indicadores calculados
    rent_final = {
        "7d":  var_7d  if var_7d  is not None else rent.get("7d"),
        "30d": var_30d if var_30d is not None else rent.get("30d"),
        "90d": rent.get("90d"),
        "180d":rent.get("180d"),
        "1a":  var_1a  if var_1a  is not None else rent.get("1a"),
    }

    # ── Scores ─────────────────────────────────────────────────────────────────
    tok_score = se.tokenomics_score(meta["tokenomics"], inflacao_anual, meta.get("queima", False))
    sc_compra = se.score_compra(rsi_val, macd_d, e9, e21, e50, e200, boll, preco, vol_rel, tend, atr_pct)
    sc_geral  = se.score_geral(
        sc_compra, tok_score, meta.get("rank", 50),
        vol_rel, vol_d.get("vol_anualizada_pct"),
        vol_d.get("sharpe"), fng.get("valor") if fng else None, tend,
    )
    sc_risco  = se.score_risco(
        vol_d.get("vol_anualizada_pct"), vol_d.get("drawdown_maximo_pct"),
        meta.get("rank", 50), atr_pct,
    )
    classif   = se.classificacao(sc_compra, sc_geral)
    risco_d   = se.gestao_risco(preco, atr_val, sr["suportes"], sr["resistencias"])
    concl     = se.conclusao_ia(
        meta["nome"], preco, rsi_val, macd_d, tend, boll,
        vol_d.get("vol_30d_pct"), fng,
        sc_compra, sc_geral, classif,
        sr["suportes"], sr["resistencias"], rent_final,
    )

    result = {
        # Cabeçalho
        "simbolo":        simbolo,
        "nome":           meta["nome"],
        "blockchain":     meta["blockchain"],
        "categoria":      meta["categoria"],
        "rank_mktcap":    meta.get("rank"),
        "preco_atual":    round(preco, 2),
        "preco_abertura": round(abertura, 2) if abertura else None,
        "preco_max_24h":  round(max_24h, 2)  if max_24h  else None,
        "preco_min_24h":  round(min_24h, 2)  if min_24h  else None,
        "variacao_24h":   round(var_24h, 2)  if var_24h  is not None else None,
        "variacao_7d":    round(var_7d,  2)  if var_7d   is not None else None,
        "variacao_30d":   round(var_30d, 2)  if var_30d  is not None else None,
        "variacao_1a":    round(var_1a,  2)  if var_1a   is not None else None,

        # Market data
        "market_data": {
            "market_cap":       round(mktcap, 2)    if mktcap  else None,
            "fdv":              round(fdv, 2)        if fdv     else None,
            "volume_24h":       round(vol_24h, 2)   if vol_24h else None,
            "volume_medio_30d": round(vol_30d_avg * preco, 2) if vol_30d_avg else None,
            "volume_market_cap":vol_mktcap,
            "fdv_market_cap":   fdv_mktcap,
            "spread":           spread,
            "spread_pct":       spread_pct,
            "liquidez":         "Alta" if (mktcap or 0) > 10e9 else "Média" if (mktcap or 0) > 1e9 else "Baixa",
        },

        # Tokenomics
        "tokenomics": {
            "supply_circulante": supply_circ,
            "supply_maximo":     supply_max,
            "supply_total":      supply_total,
            "pct_emitido":       round(pct_emitido, 1) if pct_emitido else None,
            "inflacao_anual":    inflacao_anual,
            "queima":            meta.get("queima", False),
            "rating":            meta["tokenomics"],
            "score":             round(tok_score, 1),
        },

        # Indicadores técnicos
        "tecnico": {
            "rsi":     {"valor": rsi_val, "sinal": ind.rsi_sinal(rsi_val)},
            "macd":    macd_d,
            "ema_9":   {"valor": e9,    "sinal": ind._sinal_ema(preco, e9)},
            "ema_21":  {"valor": e21,   "sinal": ind._sinal_ema(preco, e21)},
            "ema_50":  {"valor": e50,   "sinal": ind._sinal_ema(preco, e50)},
            "ema_100": {"valor": e100,  "sinal": ind._sinal_ema(preco, e100)},
            "ema_200": {"valor": e200,  "sinal": ind._sinal_ema(preco, e200)},
            "sma_200": {"valor": sma200,"sinal": ind._sinal_ema(preco, sma200)},
            "bollinger": boll,
            "atr":     {"valor": atr_val, "percentual": atr_pct},
            "obv":     {"sinal": obv_sig},
        },

        # Tendência
        "tendencia": tend,

        # Volume
        "volume_analise": {
            "volume_24h":      round(vol_24h, 2) if vol_24h else None,
            "volume_relativo": vol_rel,
            "sinal":           "acumulacao" if (vol_rel or 1) > 1.2 else "distribuicao" if (vol_rel or 1) < 0.8 else "neutro",
        },

        # Suportes e resistências
        "suportes":    sr["suportes"],
        "resistencias":sr["resistencias"],

        # Fibonacci
        "fibonacci": fib,

        # Histórico
        "historico": {
            "ath":              round(ath, 2)      if ath      else None,
            "atl":              round(atl, 2)      if atl      else None,
            "ath_data":         ath_date,
            "atl_data":         atl_date,
            "queda_desde_ath":  round(queda_ath, 2) if queda_ath is not None else None,
            "alta_desde_atl":   round(alta_atl,  2) if alta_atl  is not None else None,
            "rentabilidade":    rent_final,
        },

        # Volatilidade
        "volatilidade": {
            **vol_d,
            "atr_14":  atr_val,
            "atr_pct": atr_pct,
            "beta_btc":1.0 if simbolo == "BTC" else None,
        },

        # Sentimento
        "sentimento": {
            "fear_greed":       fng,
            "sentimento_geral": (
                "positivo" if (fng or {}).get("valor", 50) > 55
                else "negativo" if (fng or {}).get("valor", 50) < 45
                else "neutro"
            ),
            "google_trends": None,
            "twitter":       None,
            "reddit":        None,
        },

        # Desenvolvimento (GitHub via CoinGecko)
        "desenvolvimento": cg_dev,

        # On-chain (não disponível sem chave premium)
        "onchain": None,

        # Scores
        "scores": {
            "geral":      sc_geral,
            "compra":     sc_compra,
            "venda":      round(100 - sc_compra, 1),
            "risco":      sc_risco,
            "tokenomics": round(tok_score, 1),
        },

        "classificacao":  classif,
        "probabilidades": probs,
        "gestao_risco":   risco_d,
        "conclusao_ia":   concl,

        # OHLCV para o gráfico (últimos 90 dias)
        "ohlcv": candles[-90:] if candles else [],
    }

    _cache[simbolo] = {**result, "_ts": _time.time()}
    return result
