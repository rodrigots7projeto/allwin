"""
Comparativo BTC — endpoints de comparação.

GET /api/v1/cripto/comparativo/{simbolo}   → BTC × Altcoin, análise completa
GET /api/v1/cripto/ranking-btc             → Ranking de todas as altcoins vs BTC
"""
from __future__ import annotations

import asyncio
import time as _time
import logging

from fastapi import APIRouter, HTTPException

from ..cripto import coingecko_provider as cg
from ..cripto import indicators as ind
from ..cripto import comparativo_engine as ce
from ..cripto.mb_provider import MOEDAS, get_fear_greed

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/cripto", tags=["Cripto — Comparativo"])

_cache: dict[str, dict] = {}
_CACHE_COMP = 5  * 60   # 5 min para análise individual
_CACHE_RANK = 30 * 60   # 30 min para ranking completo


def _cached_get(key: str, ttl: int):
    entry = _cache.get(key)
    if entry and (_time.time() - entry.get("_ts", 0)) < ttl:
        return {k: v for k, v in entry.items() if not k.startswith("_")}
    return None


def _cached_set(key: str, data: dict) -> dict:
    _cache[key] = {**data, "_ts": _time.time()}
    return data


def _indicadores_para_moeda(nome: str, closes: list, highs: list, lows: list, volumes: list, preco: float) -> dict:
    """Calcula todos os indicadores técnicos para uma moeda."""
    rsi_v   = ind.rsi(closes)     if len(closes) > 14  else None
    macd_d  = ind.macd(closes)    if len(closes) > 35  else None
    e9      = ind.ema(closes,  9)
    e21     = ind.ema(closes, 21)
    e50     = ind.ema(closes, 50)
    e200    = ind.ema(closes, 200)
    boll    = ind.bollinger(closes)
    atr_v   = ind.atr(highs, lows, closes) if highs and lows else None
    atr_pct = round(atr_v / preco * 100, 2) if atr_v and preco else None
    adx_d   = ind.adx(highs, lows, closes) if highs and lows and len(closes) > 30 else None
    roc_v   = ind.roc(closes)
    cci_v   = ind.cci(highs, lows, closes) if highs and lows else None
    mfi_v   = ind.mfi(highs, lows, closes, volumes) if highs and lows and volumes else None
    srsi_d  = ind.stoch_rsi(closes)
    wr_v    = ind.williams_r(highs, lows, closes) if highs and lows else None
    obv_s   = ind.obv_signal(closes, volumes) if volumes else "neutro"
    tend_d  = ind.tendencia(closes) if len(closes) > 21 else {"curto_prazo": "neutra", "medio_prazo": "neutra", "longo_prazo": "neutra"}
    vol_d   = ind.volatilidade(closes)
    obv_sig = obv_s

    return {
        "rsi":        {"valor": rsi_v,  "sinal": ind.rsi_sinal(rsi_v)},
        "macd":       macd_d,
        "ema_9":      {"valor": e9,   "sinal": ind._sinal_ema(preco, e9)},
        "ema_21":     {"valor": e21,  "sinal": ind._sinal_ema(preco, e21)},
        "ema_50":     {"valor": e50,  "sinal": ind._sinal_ema(preco, e50)},
        "ema_200":    {"valor": e200, "sinal": ind._sinal_ema(preco, e200)},
        "bollinger":  boll,
        "atr":        {"valor": atr_v, "percentual": atr_pct},
        "adx":        adx_d,
        "roc":        roc_v,
        "cci":        cci_v,
        "mfi":        mfi_v,
        "stoch_rsi":  srsi_d,
        "williams_r": wr_v,
        "obv":        {"sinal": obv_sig},
        "tendencia":  tend_d,
        "volatilidade": vol_d,
    }


@router.get("/comparativo/{simbolo}")
async def comparativo_btc(simbolo: str) -> dict:
    """
    Análise comparativa completa: BTC × Altcoin.
    Calcula correlação, beta, força relativa, índice de sincronia,
    probabilidades e score comparativo.
    """
    simbolo = simbolo.upper()
    if simbolo == "BTC":
        raise HTTPException(400, "Selecione uma altcoin para comparar com o BTC.")
    if simbolo not in MOEDAS:
        raise HTTPException(404, f"Moeda '{simbolo}' não suportada.")

    hit = _cached_get(f"comp:{simbolo}", _CACHE_COMP)
    if hit:
        return hit

    meta_alt = MOEDAS[simbolo]
    meta_btc = MOEDAS["BTC"]

    # Busca dados em paralelo: BTC e altcoin (chart + ohlc) + fear&greed
    btc_chart_r, btc_ohlc_r, alt_chart_r, alt_ohlc_r, btc_coin_r, alt_coin_r, fng_r = await asyncio.gather(
        cg.get_market_chart("BTC",    365),
        cg.get_ohlc("BTC",             90),
        cg.get_market_chart(simbolo,  365),
        cg.get_ohlc(simbolo,           90),
        cg.get_coin_data("BTC"),
        cg.get_coin_data(simbolo),
        get_fear_greed(),
        return_exceptions=True,
    )

    def _safe(r, fallback):
        return fallback if isinstance(r, Exception) or r is None else r

    btc_chart = _safe(btc_chart_r, None)
    btc_ohlc  = _safe(btc_ohlc_r,  [])
    alt_chart = _safe(alt_chart_r, None)
    alt_ohlc  = _safe(alt_ohlc_r,  [])
    btc_coin  = _safe(btc_coin_r,  None)
    alt_coin  = _safe(alt_coin_r,  None)
    fng       = _safe(fng_r,       None)

    if not btc_chart and not btc_ohlc:
        raise HTTPException(503, "Dados do BTC indisponíveis. Tente novamente.")
    if not alt_chart and not alt_ohlc:
        raise HTTPException(503, f"Dados de {simbolo} indisponíveis. Tente novamente.")

    # Monta candles mesclados
    btc_candles = cg.mesclar_candles(cg.market_chart_para_candles(btc_chart) if btc_chart else [], cg.ohlc_para_candles_diarios(btc_ohlc))
    alt_candles = cg.mesclar_candles(cg.market_chart_para_candles(alt_chart) if alt_chart else [], cg.ohlc_para_candles_diarios(alt_ohlc))

    btc_closes  = [c["fechamento"] for c in btc_candles]
    btc_highs   = [c["maxima"]     for c in btc_candles]
    btc_lows    = [c["minima"]     for c in btc_candles]
    btc_volumes = [c["volume"]     for c in btc_candles]

    alt_closes  = [c["fechamento"] for c in alt_candles]
    alt_highs   = [c["maxima"]     for c in alt_candles]
    alt_lows    = [c["minima"]     for c in alt_candles]
    alt_volumes = [c["volume"]     for c in alt_candles]

    btc_md  = cg.extrair_market_data(btc_coin) if btc_coin else {}
    alt_md  = cg.extrair_market_data(alt_coin) if alt_coin else {}

    btc_preco = btc_md.get("preco_atual") or (btc_closes[-1] if btc_closes else None)
    alt_preco = alt_md.get("preco_atual") or (alt_closes[-1] if alt_closes else None)

    if not btc_preco or not alt_preco:
        raise HTTPException(503, "Preços indisponíveis.")

    # ── Indicadores técnicos ──────────────────────────────────────────────────
    btc_ind = _indicadores_para_moeda("BTC", btc_closes, btc_highs, btc_lows, btc_volumes, btc_preco)
    alt_ind = _indicadores_para_moeda(simbolo, alt_closes, alt_highs, alt_lows, alt_volumes, alt_preco)

    tend_btc = btc_ind["tendencia"]
    tend_alt = alt_ind["tendencia"]

    # ── Correlações ───────────────────────────────────────────────────────────
    corr_7   = ce.correlacao(alt_closes, btc_closes,   7)
    corr_14  = ce.correlacao(alt_closes, btc_closes,  14)
    corr_30  = ce.correlacao(alt_closes, btc_closes,  30)
    corr_90  = ce.correlacao(alt_closes, btc_closes,  90)
    corr_365 = ce.correlacao(alt_closes, btc_closes, 365)

    # ── Beta ──────────────────────────────────────────────────────────────────
    beta_90  = ce.beta(alt_closes, btc_closes,  90)
    beta_365 = ce.beta(alt_closes, btc_closes, 365)

    # ── Força Relativa ────────────────────────────────────────────────────────
    fr_7   = ce.forca_relativa(alt_closes, btc_closes,   7)
    fr_30  = ce.forca_relativa(alt_closes, btc_closes,  30)
    fr_90  = ce.forca_relativa(alt_closes, btc_closes,  90)
    fr_365 = ce.forca_relativa(alt_closes, btc_closes, 365)

    ret_btc_7   = ce.retorno_periodo(btc_closes,   7)
    ret_btc_30  = ce.retorno_periodo(btc_closes,  30)
    ret_btc_90  = ce.retorno_periodo(btc_closes,  90)
    ret_alt_7   = ce.retorno_periodo(alt_closes,   7)
    ret_alt_30  = ce.retorno_periodo(alt_closes,  30)
    ret_alt_90  = ce.retorno_periodo(alt_closes,  90)

    # ── Probabilidades ────────────────────────────────────────────────────────
    prob_90  = ce.prob_acompanhar(alt_closes, btc_closes, 90)
    prob_365 = ce.prob_acompanhar(alt_closes, btc_closes, 365)

    # ── Índice de Sincronia ───────────────────────────────────────────────────
    sinc = ce.indice_sincronia(corr_30, corr_90, corr_365, beta_90,
                                prob_90.get("prob_alta"), prob_90.get("prob_queda"))

    # ── Score Comparativo ─────────────────────────────────────────────────────
    vol_btc_30  = btc_volumes[-1] if btc_volumes else None
    vol_alt_30  = alt_volumes[-1] if alt_volumes else None
    vol_rel     = round(vol_alt_30 / vol_btc_30, 3) if vol_btc_30 and vol_alt_30 and vol_btc_30 > 0 else None
    vol_alt_a   = alt_ind["volatilidade"].get("vol_anualizada_pct")
    rsi_alt_v   = alt_ind["rsi"]["valor"]
    rank_alt    = meta_alt.get("rank", 50)

    sc = ce.score_comparativo(tend_btc, corr_30, corr_90, fr_7, fr_30, beta_90, vol_rel, rsi_alt_v, rank_alt, vol_alt_a)

    # ── Gráfico normalizado (índice = 100 no início) ──────────────────────────
    def _normalize(candles_src: list[dict], n: int = 90) -> list[dict]:
        c = candles_src[-n:] if len(candles_src) >= n else candles_src
        if not c:
            return []
        base = c[0]["fechamento"]
        return [{"data": x["data"], "idx": round(x["fechamento"] / base * 100, 2)} for x in c if base > 0]

    grafico_btc = _normalize(btc_candles)
    grafico_alt = _normalize(alt_candles)

    # Sincroniza por data
    btc_map = {g["data"]: g["idx"] for g in grafico_btc}
    alt_map = {g["data"]: g["idx"] for g in grafico_alt}
    datas   = sorted(set(btc_map) & set(alt_map))
    grafico_comparativo = [{"data": d, "btc": btc_map[d], "alt": alt_map[d]} for d in datas]

    # ── Market Cap comparativo ────────────────────────────────────────────────
    btc_mktcap = btc_md.get("market_cap")
    alt_mktcap = alt_md.get("market_cap")
    mktcap_ratio = round(alt_mktcap / btc_mktcap, 6) if btc_mktcap and alt_mktcap else None

    # ── Dominância BTC ────────────────────────────────────────────────────────
    btc_dom = None   # CoinGecko /global endpoint (não incluído no plano free básico)

    # ── Explicação IA ─────────────────────────────────────────────────────────
    explicacao = ce.explicacao_ia(
        meta_alt["nome"], corr_30, corr_90, beta_90, fr_30,
        prob_90.get("prob_alta"), prob_90.get("prob_queda"),
        tend_btc, tend_alt, sc, sinc,
    )

    result = {
        "simbolo_alt": simbolo,
        "nome_alt":    meta_alt["nome"],

        # Dados BTC
        "btc": {
            "preco":      round(btc_preco, 2),
            "variacao_24h":   btc_md.get("variacao_24h"),
            "variacao_7d":    btc_md.get("variacao_7d"),
            "variacao_30d":   btc_md.get("variacao_30d"),
            "market_cap":     btc_md.get("market_cap"),
            "volume_24h":     btc_md.get("volume_24h"),
            "retorno_7d":     ret_btc_7,
            "retorno_30d":    ret_btc_30,
            "retorno_90d":    ret_btc_90,
            "indicadores":    btc_ind,
            "fear_greed":     fng,
        },

        # Dados Altcoin
        "alt": {
            "preco":      round(alt_preco, 2),
            "variacao_24h":   alt_md.get("variacao_24h"),
            "variacao_7d":    alt_md.get("variacao_7d"),
            "variacao_30d":   alt_md.get("variacao_30d"),
            "market_cap":     alt_md.get("market_cap"),
            "volume_24h":     alt_md.get("volume_24h"),
            "retorno_7d":     ret_alt_7,
            "retorno_30d":    ret_alt_30,
            "retorno_90d":    ret_alt_90,
            "indicadores":    alt_ind,
        },

        # Comparativo direto
        "comparativo": {
            # Correlação
            "correlacao": {
                "7d":   {"valor": corr_7,   "label": ce.interpretar_correlacao(corr_7)},
                "14d":  {"valor": corr_14,  "label": ce.interpretar_correlacao(corr_14)},
                "30d":  {"valor": corr_30,  "label": ce.interpretar_correlacao(corr_30)},
                "90d":  {"valor": corr_90,  "label": ce.interpretar_correlacao(corr_90)},
                "365d": {"valor": corr_365, "label": ce.interpretar_correlacao(corr_365)},
            },
            # Beta
            "beta": {
                "90d":  {"valor": beta_90,  "label": ce.interpretar_beta(beta_90)},
                "365d": {"valor": beta_365, "label": ce.interpretar_beta(beta_365)},
            },
            # Força Relativa
            "forca_relativa": {
                "7d":   {"valor": fr_7,   "label": ce.interpretar_forca_relativa(fr_7,   7)},
                "30d":  {"valor": fr_30,  "label": ce.interpretar_forca_relativa(fr_30, 30)},
                "90d":  {"valor": fr_90,  "label": ce.interpretar_forca_relativa(fr_90, 90)},
                "365d": {"valor": fr_365, "label": ce.interpretar_forca_relativa(fr_365, 365)},
            },
            # Retornos lado a lado
            "retornos": {
                "7d":  {"btc": ret_btc_7,  "alt": ret_alt_7,  "vencedor": "alt" if (ret_alt_7 or 0) > (ret_btc_7 or 0) else "btc"},
                "30d": {"btc": ret_btc_30, "alt": ret_alt_30, "vencedor": "alt" if (ret_alt_30 or 0) > (ret_btc_30 or 0) else "btc"},
                "90d": {"btc": ret_btc_90, "alt": ret_alt_90, "vencedor": "alt" if (ret_alt_90 or 0) > (ret_btc_90 or 0) else "btc"},
            },
            # Market cap
            "market_cap": {
                "btc":    btc_mktcap,
                "alt":    alt_mktcap,
                "ratio":  mktcap_ratio,
            },
            # Volume relativo
            "volume_relativo": vol_rel,
        },

        # Índice de sincronia
        "indice_sincronia": sinc,
        "indice_sincronia_label": (
            "Alta Sincronia" if sinc >= 75
            else "Sincronia Moderada" if sinc >= 50
            else "Baixa Sincronia" if sinc >= 25
            else "Muito Baixa / Independente"
        ),

        # Probabilidades
        "probabilidades": {
            "se_btc_subir": {
                "probabilidade": prob_90.get("prob_alta"),
                "intensidade":   prob_90.get("intensidade_alta"),
                "label_intens":  ce.intensidade_label(prob_90.get("intensidade_alta")),
            },
            "se_btc_cair": {
                "probabilidade": prob_90.get("prob_queda"),
                "intensidade":   prob_90.get("intensidade_queda"),
                "label_intens":  ce.interpretar_queda(prob_90.get("intensidade_queda")),
            },
            "periodo_dias": prob_90.get("n"),
            "longo_prazo": {
                "se_btc_subir": {"probabilidade": prob_365.get("prob_alta"), "intensidade": prob_365.get("intensidade_alta")},
                "se_btc_cair":  {"probabilidade": prob_365.get("prob_queda"), "intensidade": prob_365.get("intensidade_queda")},
            },
        },

        # Score e classificação
        "score_comparativo": sc,
        "score_label": (
            "Altcoin Líder" if sc >= 80
            else "Forte Sincronia" if sc >= 65
            else "Boa Sincronia" if sc >= 50
            else "Baixa Sincronia" if sc >= 35
            else "Muito Baixa Sincronia"
        ),

        # Gráfico
        "grafico": grafico_comparativo[-90:],

        # IA
        "explicacao_ia": explicacao,
    }

    return _cached_set(f"comp:{simbolo}", result)


@router.get("/ranking-btc")
async def ranking_btc() -> dict:
    """
    Ranking de todas as altcoins vs BTC, usando dados da CoinGecko.
    Cache de 30 minutos.
    """
    hit = _cached_get("rank:btc", _CACHE_RANK)
    if hit:
        return hit

    # Busca market chart do BTC (necessário para correlação)
    btc_chart_r, btc_coin_r = await asyncio.gather(
        cg.get_market_chart("BTC", 90),
        cg.get_coin_data("BTC"),
        return_exceptions=True,
    )
    btc_chart = None if isinstance(btc_chart_r, Exception) else btc_chart_r
    btc_coin  = None if isinstance(btc_coin_r,  Exception) else btc_coin_r

    btc_candles = cg.mesclar_candles(
        cg.market_chart_para_candles(btc_chart) if btc_chart else [],
        [],
    )
    btc_closes = [c["fechamento"] for c in btc_candles]
    btc_md     = cg.extrair_market_data(btc_coin) if btc_coin else {}

    # Para cada altcoin, busca dados e calcula métricas
    altcoins = [s for s in MOEDAS if s != "BTC"]
    ranking_items = []

    for simbolo in altcoins:
        try:
            alt_chart_r, alt_coin_r = await asyncio.gather(
                cg.get_market_chart(simbolo, 90),
                cg.get_coin_data(simbolo),
                return_exceptions=True,
            )
            alt_chart = None if isinstance(alt_chart_r, Exception) else alt_chart_r
            alt_coin  = None if isinstance(alt_coin_r,  Exception) else alt_coin_r

            alt_candles = cg.mesclar_candles(
                cg.market_chart_para_candles(alt_chart) if alt_chart else [],
                [],
            )
            alt_closes = [c["fechamento"] for c in alt_candles]
            alt_md     = cg.extrair_market_data(alt_coin) if alt_coin else {}

            meta = MOEDAS[simbolo]

            corr_30 = ce.correlacao(alt_closes, btc_closes, 30)
            corr_90 = ce.correlacao(alt_closes, btc_closes, 90)
            beta_v  = ce.beta(alt_closes, btc_closes, 90)
            fr_30   = ce.forca_relativa(alt_closes, btc_closes, 30)
            fr_7    = ce.forca_relativa(alt_closes, btc_closes, 7)
            prob    = ce.prob_acompanhar(alt_closes, btc_closes, 90)
            sinc    = ce.indice_sincronia(corr_30, corr_90, None, beta_v, prob.get("prob_alta"), prob.get("prob_queda"))

            ret_btc_30 = ce.retorno_periodo(btc_closes, 30)
            ret_alt_30 = ce.retorno_periodo(alt_closes, 30)
            ret_btc_7  = ce.retorno_periodo(btc_closes, 7)
            ret_alt_7  = ce.retorno_periodo(alt_closes, 7)

            tend_btc = ind.tendencia(btc_closes) if len(btc_closes) > 21 else {"longo_prazo": "neutra"}
            rsi_v    = ind.rsi(alt_closes) if len(alt_closes) > 14 else None
            vol_alt  = ind.volatilidade(alt_closes)

            sc = ce.score_comparativo(
                tend_btc, corr_30, corr_90, fr_7, fr_30,
                beta_v, None, rsi_v, meta.get("rank", 50),
                vol_alt.get("vol_anualizada_pct"),
            )

            ranking_items.append({
                "simbolo":        simbolo,
                "nome":           meta["nome"],
                "rank_mktcap":    meta.get("rank"),
                "score":          sc,
                "indice_sincronia": sinc,
                "correlacao_30":  corr_30,
                "correlacao_90":  corr_90,
                "beta":           beta_v,
                "fr_7":           fr_7,
                "fr_30":          fr_30,
                "retorno_btc_30": ret_btc_30,
                "retorno_alt_30": ret_alt_30,
                "retorno_btc_7":  ret_btc_7,
                "retorno_alt_7":  ret_alt_7,
                "prob_alta":      prob.get("prob_alta"),
                "prob_queda":     prob.get("prob_queda"),
                "market_cap":     alt_md.get("market_cap"),
                "variacao_24h":   alt_md.get("variacao_24h"),
                "variacao_7d":    alt_md.get("variacao_7d"),
                "variacao_30d":   alt_md.get("variacao_30d"),
            })

            await asyncio.sleep(0.3)  # respeita rate limit CoinGecko
        except Exception as exc:
            logger.warning("Ranking BTC — erro em %s: %s", simbolo, exc)

    # Gera rankings temáticos
    def _top(key: str, reverse: bool = True, n: int = 5) -> list:
        return sorted(
            [x for x in ranking_items if x.get(key) is not None],
            key=lambda x: x[key], reverse=reverse,
        )[:n]

    result = {
        "btc_preco":    round(btc_md.get("preco_atual") or (btc_closes[-1] if btc_closes else 0), 2),
        "btc_var_24h":  btc_md.get("variacao_24h"),
        "btc_var_7d":   btc_md.get("variacao_7d"),
        "btc_market_cap":btc_md.get("market_cap"),
        "total_altcoins": len(ranking_items),
        "altcoins": sorted(ranking_items, key=lambda x: x["score"], reverse=True),
        "rankings": {
            "mais_sincronizadas":   _top("indice_sincronia"),
            "superam_btc_nas_altas":_top("fr_30"),
            "mais_resilientes":     sorted([x for x in ranking_items if x.get("prob_queda") is not None], key=lambda x: x["prob_queda"])[:5],
            "mais_independentes":   _top("indice_sincronia", reverse=False),
            "maior_fr_7d":          _top("fr_7"),
            "maior_score":          _top("score"),
        },
    }

    return _cached_set("rank:btc", result)
