"""
Motor de Backtest — AllWin
Simula perfis Day Trade sobre dados históricos da Binance.
Usa o mesmo motor de sinal da sessão ao vivo (daytrade_engine.calcular_daytrade).
"""

from __future__ import annotations

import asyncio
import bisect
import math
import uuid
from datetime import datetime, timezone
from typing import Any

import httpx

from .daytrade_engine import calcular_daytrade

# ── Constantes ────────────────────────────────────────────────────────────────

BINANCE_SPOT  = "https://api.binance.com"
MAX_KLINES    = 1000           # limite por request Binance
EVAL_TFS      = ["1d", "4h", "1h"]  # TFs providos ao motor de sinal
EVAL_INTERVAL = "4h"           # frequência de avaliação (loop principal)
CUSTO_DEF     = 0.04           # 0.04% por lado (maker Binance)
SLIP_DEF      = 0.05           # 0.05% por lado (slippage)
MIN_CANDLES   = 50             # candles mínimos para avaliar


# ── Busca de dados históricos ─────────────────────────────────────────────────

async def _fetch_klines(
    client: httpx.AsyncClient,
    simbolo: str,
    interval: str,
    start_ms: int,
    end_ms: int,
) -> list[dict]:
    """Busca klines com paginação automática (endpoint spot Binance)."""
    result: list[dict] = []
    cur = start_ms

    while cur < end_ms:
        resp = await client.get(
            f"{BINANCE_SPOT}/api/v3/klines",
            params={
                "symbol":    simbolo,
                "interval":  interval,
                "startTime": cur,
                "endTime":   end_ms,
                "limit":     MAX_KLINES,
            },
            timeout=30,
        )
        resp.raise_for_status()
        data = resp.json()
        if not data:
            break

        for k in data:
            result.append({
                "t":       int(k[0]),
                "o":       float(k[1]),
                "h":       float(k[2]),
                "l":       float(k[3]),
                "c":       float(k[4]),
                "v":       float(k[5]),
                "buy_vol": float(k[9]),
                "trades":  int(k[8]),
            })

        last_t = int(data[-1][0])
        if last_t <= cur or len(data) < MAX_KLINES:
            break
        cur = last_t + 1

    return result


async def fetch_historical(
    simbolo: str,
    inicio: datetime,
    fim: datetime,
) -> dict[str, list[dict]]:
    """
    Baixa dados históricos para todos os TFs de avaliação.
    Retorna {tf: [candles]} — cada candle tem t/o/h/l/c/v/buy_vol/trades.
    """
    start_ms = int(inicio.timestamp() * 1000)
    end_ms   = int(fim.timestamp()   * 1000)

    async with httpx.AsyncClient() as client:
        tasks = [
            _fetch_klines(client, simbolo, tf, start_ms, end_ms)
            for tf in EVAL_TFS
        ]
        results = await asyncio.gather(*tasks, return_exceptions=True)

    return {
        tf: (r if isinstance(r, list) else [])
        for tf, r in zip(EVAL_TFS, results)
    }


# ── Utilitários de índice ─────────────────────────────────────────────────────

def _idx_before(candles: list[dict], ts: int) -> int:
    """
    Retorna o primeiro índice cujo timestamp > ts (busca binária).
    Todos os candles[:retorno] têm ts <= ts.
    """
    lo, hi = 0, len(candles)
    while lo < hi:
        mid = (lo + hi) // 2
        if candles[mid]["t"] <= ts:
            lo = mid + 1
        else:
            hi = mid
    return lo


def _slice(candles: list[dict], ts: int, n: int = 200) -> list[dict]:
    idx = _idx_before(candles, ts)
    return candles[max(0, idx - n):idx]


# ── Métricas ──────────────────────────────────────────────────────────────────

def _daily_returns(equity: list[dict]) -> list[float]:
    """Retornos diários calculados a partir da curva de equity."""
    if len(equity) < 2:
        return []
    daily: dict[int, float] = {}
    for p in equity:
        day = p["ts"] // 86_400_000
        daily[day] = p["capital"]
    days = sorted(daily)
    return [
        (daily[days[i]] - daily[days[i - 1]]) / daily[days[i - 1]]
        for i in range(1, len(days))
        if daily[days[i - 1]] > 0
    ]


def _sharpe(returns: list[float]) -> float:
    if len(returns) < 2:
        return 0.0
    n = len(returns)
    mu = sum(returns) / n
    var = sum((r - mu) ** 2 for r in returns) / (n - 1)
    std = math.sqrt(var)
    return (mu / std) * math.sqrt(252) if std else 0.0


def _sortino(returns: list[float]) -> float:
    if len(returns) < 2:
        return 0.0
    mu = sum(returns) / len(returns)
    neg = [(r ** 2) for r in returns if r < 0]
    dd  = math.sqrt(sum(neg) / len(neg)) if neg else 0.0
    return (mu / dd) * math.sqrt(252) if dd else 10.0


def _metricas(
    trades: list[dict],
    capital_ini: float,
    capital_fin: float,
    equity: list[dict],
    dias: int,
) -> dict:
    if not trades:
        return {k: 0 for k in (
            "total_trades", "wins", "losses", "win_rate", "profit_factor",
            "max_drawdown", "retorno_total", "expectancia", "payoff",
            "recovery_factor", "sharpe", "sortino",
            "gross_profit", "gross_loss", "avg_ganho", "avg_perda",
            "capital_inicial", "capital_final", "cagr",
        )}

    ganhos = [t["pnl"] for t in trades if t["pnl"] > 0]
    perdas = [t["pnl"] for t in trades if t["pnl"] <= 0]
    total  = len(trades)
    wins   = len(ganhos)

    wr      = wins / total
    ag      = sum(ganhos) / len(ganhos) if ganhos else 0.0
    ap      = sum(perdas) / len(perdas) if perdas else 0.0
    gp      = sum(ganhos)
    gl      = abs(sum(perdas))
    pf      = gp / gl if gl else (10.0 if gp else 0.0)
    exp     = wr * ag + (1 - wr) * ap
    payoff  = abs(ag / ap) if ap else 0.0

    peak   = capital_ini
    max_dd = 0.0
    for p in equity:
        c = p["capital"]
        if c > peak:
            peak = c
        dd = (peak - c) / peak if peak > 0 else 0.0
        if dd > max_dd:
            max_dd = dd

    ret   = (capital_fin - capital_ini) / capital_ini
    rec   = ret / max_dd if max_dd else 0.0

    dr    = _daily_returns(equity)
    sh    = _sharpe(dr)
    so    = _sortino(dr)
    cagr  = (((capital_fin / capital_ini) ** (365 / max(dias, 1))) - 1) if capital_ini > 0 else 0

    return {
        "total_trades":    total,
        "wins":            wins,
        "losses":          total - wins,
        "win_rate":        round(wr * 100, 2),
        "profit_factor":   round(pf, 3),
        "max_drawdown":    round(max_dd * 100, 2),
        "retorno_total":   round(ret * 100, 2),
        "expectancia":     round(exp, 2),
        "payoff":          round(payoff, 3),
        "recovery_factor": round(rec, 3),
        "sharpe":          round(sh, 3),
        "sortino":         round(so, 3),
        "gross_profit":    round(gp, 2),
        "gross_loss":      round(gl, 2),
        "avg_ganho":       round(ag, 2),
        "avg_perda":       round(ap, 2),
        "capital_inicial": capital_ini,
        "capital_final":   round(capital_fin, 2),
        "cagr":            round(cagr * 100, 2),
    }


# ── Motor de Simulação ────────────────────────────────────────────────────────

def _adapt_learn(learn: float, trades: list[dict]) -> float:
    """Ajuste adaptativo do threshold de entrada (replicado do frontend)."""
    if len(trades) < 5:
        return learn
    last = trades[-15:]
    wr   = sum(1 for t in last if t["resultado"] == "ganho") / len(last)
    if wr > 0.72:
        learn = max(learn - 4, -10)
    elif wr < 0.28:
        learn = min(learn + 8, 20)
    cons_loss = 0
    for t in reversed(last):
        if t["resultado"] == "perda":
            cons_loss += 1
        else:
            break
    if cons_loss >= 3:
        learn = min(learn + 3, 20)
    return learn


def simulate(
    simbolo: str,
    candles_por_tf: dict[str, list[dict]],
    perfil: dict,
    custo_pct: float = CUSTO_DEF,
    slippage_pct: float = SLIP_DEF,
    fear_greed: int = 50,
) -> dict[str, Any]:
    """
    Simula um perfil sobre os candles históricos fornecidos.
    Usa EVAL_INTERVAL (4h) como frequência de avaliação.
    """
    base = candles_por_tf.get(EVAL_INTERVAL, [])
    if len(base) < MIN_CANDLES + 1:
        return {
            "erro":       "Candles insuficientes para simulação",
            "trades":     [],
            "equity":     [],
            "metricas":   {},
        }

    capital     = float(perfil.get("capital_inicial", 10_000))
    capital_ini = capital
    trades: list[dict] = []
    equity: list[dict] = []
    position: dict | None = None
    learn = 0.0

    sc  = float(perfil["score_compra"])
    sv  = float(perfil["score_venda"])
    bpm = float(perfil["bull_pct_min"])
    sl  = float(perfil["sl_pct"])  / 100
    tp  = float(perfil["tp_pct"])  / 100
    smx = perfil.get("score_max_compra")
    ao  = bool(perfil.get("aguardar_ok",    False))
    aa  = bool(perfil.get("apenas_aguardar", False))
    stk = float(perfil.get("stake_base",    capital_ini * 0.1))
    sds = perfil.get("stake_dupla_score")
    custo_rt = (custo_pct + slippage_pct) / 100  # round-trip cost fraction

    inicio_ts = base[0]["t"]
    fim_ts    = base[-1]["t"]
    dias_total = max(1, (fim_ts - inicio_ts) // 86_400_000)

    for i in range(MIN_CANDLES, len(base)):
        curr  = base[i]
        price = curr["c"]
        ts    = curr["t"]

        # Construir slices para o motor de sinal
        slices = {tf: _slice(clist, ts, 200) for tf, clist in candles_por_tf.items()}

        # Gerar sinal
        try:
            sinal = calcular_daytrade(simbolo, slices, fear_greed)
        except Exception:
            equity.append({"ts": ts, "capital": round(capital, 2)})
            continue

        score   = float(sinal.get("score",    0))
        bullish = bool( sinal.get("bullish",  False))
        operar  = bool( sinal.get("operar",   False))
        # bull_pct fica em consenso.bull_pct (0-100); top-level é sempre None
        consenso = sinal.get("consenso") or {}
        bull_p   = float(consenso.get("bull_pct", 100) or 100)

        # ── Saída da posição ──────────────────────────────────────────────────
        if position is not None:
            ep   = position["entry_price"]
            sl_p = ep * (1 - sl)
            tp_p = ep * (1 + tp)
            motivo: str | None = None
            exit_p = price

            if curr["l"] <= sl_p:
                exit_p = sl_p
                motivo = "Stop Loss"
            elif curr["h"] >= tp_p:
                exit_p = tp_p
                motivo = "Take Profit"
            elif not bullish and score < sv:
                motivo = "Sinal Bearish"

            if motivo:
                cost = exit_p * position["qty"] * custo_rt
                pnl  = (exit_p - ep) * position["qty"] - cost - position["entry_cost"]
                capital += pnl + position["stake"]
                resultado = "ganho" if pnl > 0 else "perda"
                trades.append({
                    "simbolo":       simbolo,
                    "entrada_ts":    position["entry_ts"],
                    "saida_ts":      ts,
                    "entrada_preco": round(ep, 6),
                    "saida_preco":   round(exit_p, 6),
                    "stake":         position["stake"],
                    "pnl":           round(pnl, 2),
                    "pnl_pct":       round((exit_p / ep - 1) * 100, 3),
                    "motivo":        motivo,
                    "resultado":     resultado,
                    "capital_after": round(capital, 2),
                })
                position = None
                learn = _adapt_learn(learn, trades)

        equity.append({"ts": ts, "capital": round(capital, 2)})

        # ── Entrada na posição ────────────────────────────────────────────────
        if position is None:
            sc_ef  = max(10.0, min(95.0, sc + learn))
            dentro = score >= sc_ef and (smx is None or score <= smx)
            b_ok   = bull_p >= bpm

            if aa:
                ok = not operar and bullish and dentro and b_ok
            elif ao:
                ok = bullish and dentro and b_ok
            else:
                ok = operar and bullish and dentro and b_ok

            if ok and capital >= stk:
                stake_uso  = min(stk * 2 if (sds and score >= sds) else stk, capital)
                entry_cost = stake_uso * custo_rt
                qty        = (stake_uso - entry_cost) / price
                capital   -= stake_uso
                position   = {
                    "entry_price": price,
                    "stake":       stake_uso,
                    "qty":         qty,
                    "entry_ts":    ts,
                    "entry_cost":  entry_cost,
                }

    # Fechar posição remanescente no final do período
    if position is not None and base:
        last   = base[-1]
        ep     = position["entry_price"]
        lp     = last["c"]
        cost   = lp * position["qty"] * custo_rt
        pnl    = (lp - ep) * position["qty"] - cost - position["entry_cost"]
        capital += pnl + position["stake"]
        trades.append({
            "simbolo":       simbolo,
            "entrada_ts":    position["entry_ts"],
            "saida_ts":      last["t"],
            "entrada_preco": round(ep, 6),
            "saida_preco":   round(lp, 6),
            "stake":         position["stake"],
            "pnl":           round(pnl, 2),
            "pnl_pct":       round((lp / ep - 1) * 100, 3),
            "motivo":        "Fim do período",
            "resultado":     "ganho" if pnl > 0 else "perda",
            "capital_after": round(capital, 2),
        })

    met = _metricas(trades, capital_ini, capital, equity, dias_total)

    return {
        "trades":   trades,
        "equity":   equity,
        "metricas": met,
    }


# ── Overfitting check ─────────────────────────────────────────────────────────

def overfitting_check(
    trades_train: list[dict], met_train: dict,
    trades_test:  list[dict], met_test:  dict,
) -> dict:
    """
    Detecta overfitting comparando métricas de treino vs teste.
    """
    warnings: list[str] = []
    score = 100  # confiança inicial

    if not trades_test:
        return {"score_confianca": 0, "alertas": ["Sem operações no período de teste"]}

    # Degradação de retorno
    ret_train = met_train.get("retorno_total", 0)
    ret_test  = met_test.get("retorno_total",  0)
    if ret_train > 0 and ret_test < 0:
        warnings.append("Estratégia lucrativa no treino, deficitária no teste")
        score -= 40
    elif ret_train > 0 and ret_test < ret_train * 0.4:
        warnings.append("Retorno no teste < 40% do retorno no treino")
        score -= 20

    # Win rate degradando muito
    wr_train = met_train.get("win_rate", 0)
    wr_test  = met_test.get("win_rate",  0)
    if wr_train - wr_test > 20:
        warnings.append(f"Win Rate caiu {wr_train - wr_test:.1f}pp no teste")
        score -= 15

    # Profit factor colapsando
    pf_train = met_train.get("profit_factor", 0)
    pf_test  = met_test.get("profit_factor",  0)
    if pf_train > 1.5 and pf_test < 1.0:
        warnings.append("Profit Factor abaixo de 1 no período de teste")
        score -= 20

    # Poucos trades
    n_test = met_test.get("total_trades", 0)
    if n_test < 10:
        warnings.append(f"Apenas {n_test} operações no teste — amostra insuficiente")
        score -= 15

    return {
        "score_confianca": max(0, score),
        "alertas":         warnings,
        "treino":          met_train,
        "teste":           met_test,
    }


# ── Otimização automática de score_compra ─────────────────────────────────────

async def optimize_scores(
    simbolo: str,
    data_inicio: datetime,
    data_fim: datetime,
    perfil_base: dict,
    custo_pct: float = CUSTO_DEF,
    slippage_pct: float = SLIP_DEF,
    fear_greed: int = 50,
) -> dict[str, Any]:
    """
    Testa múltiplos valores de score_compra e retorna o ótimo.
    Faz apenas 1 fetch de dados históricos e roda N simulations.
    Critério de ótimo: maior Sharpe com PF > 1.2 e ≥ 10 trades.
    """
    candles = await fetch_historical(simbolo, data_inicio, data_fim)
    base = candles.get(EVAL_INTERVAL, [])
    if len(base) < MIN_CANDLES + 10:
        return {"erro": "Dados insuficientes para otimização"}

    # Range de scores a testar (passos de 5)
    is_aguardar = bool(perfil_base.get("aguardar_ok")) or bool(perfil_base.get("apenas_aguardar"))
    if is_aguardar:
        score_range = list(range(35, 70, 5))   # [35, 40, 45, 50, 55, 60, 65]
    else:
        score_range = list(range(55, 80, 5))   # [55, 60, 65, 70, 75]  (precisa operar>=60)

    resultados: list[dict] = []
    for sc in score_range:
        perfil_teste = {**perfil_base, "score_compra": sc}
        res = simulate(simbolo, candles, perfil_teste, custo_pct, slippage_pct, fear_greed)
        m = res.get("metricas", {})
        resultados.append({
            "score_compra":  sc,
            "total_trades":  m.get("total_trades",  0),
            "win_rate":      round(m.get("win_rate",      0), 1),
            "profit_factor": round(m.get("profit_factor", 0), 3),
            "sharpe":        round(m.get("sharpe",        0), 3),
            "retorno_total": round(m.get("retorno_total", 0), 2),
            "max_drawdown":  round(m.get("max_drawdown",  0), 2),
            "expectancia":   round(m.get("expectancia",   0), 2),
        })

    # Ótimo: melhor Sharpe com PF > 1.2 e ≥ 10 trades
    validos = [r for r in resultados if r["total_trades"] >= 10 and r["profit_factor"] > 1.2]
    if validos:
        ótimo = max(validos, key=lambda r: r["sharpe"])
    else:
        # Fallback: mais trades entre os que têm algum resultado
        com_trades = [r for r in resultados if r["total_trades"] > 0]
        ótimo = max(com_trades, key=lambda r: r["total_trades"]) if com_trades else resultados[0]

    # Score ótimo com boa justificativa
    sc_recomendado = ótimo["score_compra"]
    justificativa = (
        f"Score {sc_recomendado} otimizado por Sharpe={ótimo['sharpe']:.2f}, "
        f"PF={ótimo['profit_factor']:.2f}, WR={ótimo['win_rate']:.1f}%, "
        f"Trades={ótimo['total_trades']}"
    )

    return {
        "perfil_id":         perfil_base["id"],
        "perfil_nome":       perfil_base["nome"],
        "simbolo":           simbolo,
        "score_compra_atual": perfil_base.get("score_compra"),
        "score_compra_otimo": sc_recomendado,
        "justificativa":     justificativa,
        "otimo":             ótimo,
        "todos_resultados":  resultados,
        "periodo": {
            "inicio": data_inicio.date().isoformat(),
            "fim":    data_fim.date().isoformat(),
            "dias":   (data_fim - data_inicio).days,
        },
    }


# ── Backtest completo (público) ───────────────────────────────────────────────

async def run_backtest(
    simbolo: str,
    perfil: dict,
    data_inicio: datetime,
    data_fim: datetime,
    custo_pct: float = CUSTO_DEF,
    slippage_pct: float = SLIP_DEF,
    fear_greed: int = 50,
) -> dict[str, Any]:
    """
    Executa o backtest completo:
    1. Baixa dados históricos da Binance
    2. Simula o perfil
    3. Calcula métricas e overfitting check (70/30 split)
    """
    candles = await fetch_historical(simbolo, data_inicio, data_fim)

    base = candles.get(EVAL_INTERVAL, [])
    if not base:
        return {"erro": f"Sem dados para {simbolo} no período solicitado"}

    # Backtest completo
    resultado = simulate(
        simbolo, candles, perfil,
        custo_pct=custo_pct, slippage_pct=slippage_pct, fear_greed=fear_greed,
    )

    # Train/test split (70/30) para overfitting check
    split_idx = int(len(base) * 0.70)
    split_ts  = base[split_idx]["t"]

    train_candles = {tf: [c for c in clist if c["t"] <= split_ts] for tf, clist in candles.items()}
    test_candles  = {tf: [c for c in clist if c["t"] >  split_ts] for tf, clist in candles.items()}

    res_train = simulate(simbolo, train_candles, perfil, custo_pct, slippage_pct, fear_greed)
    res_test  = simulate(simbolo, test_candles,  perfil, custo_pct, slippage_pct, fear_greed)

    overfitting = overfitting_check(
        res_train.get("trades", []), res_train.get("metricas", {}),
        res_test.get("trades",  []), res_test.get("metricas",  {}),
    )

    now = datetime.now(timezone.utc).isoformat()
    dias = max(1, (base[-1]["t"] - base[0]["t"]) // 86_400_000)

    return {
        "id":          str(uuid.uuid4()),
        "simbolo":     simbolo,
        "perfil_id":   perfil["id"],
        "perfil_nome": perfil["nome"],
        "periodo": {
            "inicio": data_inicio.date().isoformat(),
            "fim":    data_fim.date().isoformat(),
            "dias":   dias,
        },
        "config": {
            "custo_pct":    custo_pct,
            "slippage_pct": slippage_pct,
        },
        "metricas":   resultado.get("metricas",  {}),
        "equity":     resultado.get("equity",    []),
        "trades":     resultado.get("trades",    []),
        "overfitting": overfitting,
        "gerado_em":  now,
    }
