"""
Bot Worker — roda em background no Railway 24/7.
30 bots com perfis diferentes operam futuros continuamente, sem depender do browser.
A cada INTERVAL segundos: busca scan, cada bot avalia filtros, abre/fecha posições, salva MySQL.
Aprendizado: a cada 10 trades fechados, win rate < 40% eleva score_min; WR ≥ 65% reduz.
"""
from __future__ import annotations

import asyncio
import time
import uuid
from typing import Any, Optional

from ..db.mysql import (
    trade_insert,
    trades_list,
    wallet_load_all,
    wallet_upsert,
)

INTERVAL = 10 * 60   # 10 minutos (mesma cadência do futures worker)
FEE_RATE = 0.0004    # 0.04% taxa futuros

# ── Perfis dos 30 bots (espelho exato do frontend BOT_PROFILES) ──────────────

BOT_PROFILES: list[dict] = [
    # ── 20 bots originais (gregos) ────────────────────────────────────────────
    {"id": "bot_atlas",      "name": "ATLAS",      "capital": 100000,
     "strategy": {"score_min": 60, "direction": "BOTH",  "sl_pct": 0.010, "tp_pct": 0.025, "stake": 1000, "max_positions": 5}},
    {"id": "bot_zeus",       "name": "ZEUS",        "capital": 100000,
     "strategy": {"score_min": 75, "direction": "BOTH",  "sl_pct": 0.007, "tp_pct": 0.018, "stake": 2000, "max_positions": 3}},
    {"id": "bot_orion",      "name": "ORION",       "capital": 100000,
     "strategy": {"score_min": 55, "direction": "LONG",  "sl_pct": 0.012, "tp_pct": 0.030, "stake": 800,  "max_positions": 6}},
    {"id": "bot_hermes",     "name": "HERMES",      "capital": 100000,
     "strategy": {"score_min": 50, "direction": "BOTH",  "sl_pct": 0.008, "tp_pct": 0.015, "stake": 600,  "max_positions": 8}},
    {"id": "bot_apollo",     "name": "APOLLO",      "capital": 100000,
     "strategy": {"score_min": 65, "grade_required": ["A+", "A"], "direction": "LONG", "sl_pct": 0.009, "tp_pct": 0.022, "stake": 1200, "max_positions": 4}},
    {"id": "bot_ares",       "name": "ARES",        "capital": 100000,
     "strategy": {"score_min": 58, "direction": "SHORT", "sl_pct": 0.010, "tp_pct": 0.025, "stake": 900,  "max_positions": 4}},
    {"id": "bot_poseidon",   "name": "POSEIDON",    "capital": 100000,
     "strategy": {"score_min": 62, "require_funding_neg": True, "direction": "LONG", "sl_pct": 0.009, "tp_pct": 0.022, "stake": 1000, "max_positions": 4}},
    {"id": "bot_hades",      "name": "HADES",       "capital": 100000,
     "strategy": {"score_min": 70, "direction": "SHORT", "sl_pct": 0.008, "tp_pct": 0.020, "stake": 1500, "max_positions": 3}},
    {"id": "bot_athena",     "name": "ATHENA",      "capital": 100000,
     "strategy": {"score_min": 68, "grade_required": ["A+", "A", "B"], "direction": "BOTH", "sl_pct": 0.009, "tp_pct": 0.022, "stake": 1000, "max_positions": 4}},
    {"id": "bot_titan",      "name": "TITAN",       "capital": 100000,
     "strategy": {"score_min": 45, "direction": "BOTH",  "sl_pct": 0.015, "tp_pct": 0.040, "stake": 500,  "max_positions": 10}},
    {"id": "bot_kronos",     "name": "KRONOS",      "capital": 100000,
     "strategy": {"score_min": 72, "require_oi_increase": True, "direction": "BOTH", "sl_pct": 0.007, "tp_pct": 0.018, "stake": 1500, "max_positions": 3}},
    {"id": "bot_helios",     "name": "HELIOS",      "capital": 100000,
     "strategy": {"score_min": 63, "require_cvd_bullish": True, "direction": "LONG", "sl_pct": 0.010, "tp_pct": 0.025, "stake": 1000, "max_positions": 4}},
    {"id": "bot_artemis",    "name": "ARTEMIS",     "capital": 100000,
     "strategy": {"score_min": 66, "bull_pct_min": 54, "direction": "LONG", "sl_pct": 0.009, "tp_pct": 0.022, "stake": 900, "max_positions": 5}},
    {"id": "bot_hephaestus", "name": "HEPHAESTUS", "capital": 100000,
     "strategy": {"score_min": 60, "grade_required": ["A+", "A", "B", "C"], "direction": "BOTH", "sl_pct": 0.012, "tp_pct": 0.030, "stake": 700, "max_positions": 6}},
    {"id": "bot_dionysus",   "name": "DIONYSUS",    "capital": 100000,
     "strategy": {"score_min": 48, "altcoin_only": True, "direction": "BOTH", "sl_pct": 0.015, "tp_pct": 0.040, "stake": 400, "max_positions": 8}},
    {"id": "bot_eros",       "name": "EROS",        "capital": 100000,
     "strategy": {"score_min": 55, "bull_pct_min": 55, "direction": "LONG", "sl_pct": 0.010, "tp_pct": 0.025, "stake": 800, "max_positions": 5}},
    {"id": "bot_nike",       "name": "NIKE",        "capital": 100000,
     "strategy": {"score_min": 64, "require_funding_neg": True, "require_cvd_bullish": True, "direction": "LONG", "sl_pct": 0.009, "tp_pct": 0.022, "stake": 1100, "max_positions": 3}},
    {"id": "bot_proteus",    "name": "PROTEUS",     "capital": 100000,
     "strategy": {"score_min": 52, "direction": "BOTH",  "sl_pct": 0.013, "tp_pct": 0.032, "stake": 600,  "max_positions": 7}},
    {"id": "bot_prometheus", "name": "PROMETHEUS",  "capital": 100000,
     "strategy": {"score_min": 70, "require_oi_increase": True, "require_cvd_bullish": True, "direction": "LONG", "sl_pct": 0.008, "tp_pct": 0.020, "stake": 1300, "max_positions": 3}},
    {"id": "bot_nemesis",    "name": "NEMESIS",     "capital": 100000,
     "strategy": {"score_min": 65, "direction": "SHORT", "sl_pct": 0.010, "tp_pct": 0.025, "stake": 800,  "max_positions": 4}},

    # ── 10 bots conservadores (romanos) ───────────────────────────────────────
    {"id": "bot_minerva",  "name": "MINERVA",  "capital": 100000,
     "strategy": {"score_min": 76, "grade_required": ["A+"], "require_ist_min": 68, "direction": "BOTH",  "sl_pct": 0.005, "tp_pct": 0.013, "stake": 800,  "max_positions": 2}},
    {"id": "bot_jupiter",  "name": "JUPITER",  "capital": 100000,
     "strategy": {"score_min": 80, "grade_required": ["A+"], "require_ist_min": 65, "direction": "BOTH",  "sl_pct": 0.004, "tp_pct": 0.010, "stake": 3000, "max_positions": 1}},
    {"id": "bot_caesar",   "name": "CAESAR",   "capital": 100000,
     "strategy": {"score_min": 75, "grade_required": ["A+", "A"], "bull_pct_min": 58, "direction": "LONG",  "sl_pct": 0.005, "tp_pct": 0.013, "stake": 1000, "max_positions": 2}},
    {"id": "bot_diana",    "name": "DIANA",    "capital": 100000,
     "strategy": {"score_min": 74, "grade_required": ["A+"], "require_ist_min": 65, "direction": "LONG",  "sl_pct": 0.005, "tp_pct": 0.012, "stake": 600,  "max_positions": 2}},
    {"id": "bot_mercurio", "name": "MERCURIO", "capital": 100000,
     "strategy": {"score_min": 65, "grade_required": ["A+", "A"], "direction": "BOTH",  "sl_pct": 0.004, "tp_pct": 0.009, "stake": 1500, "max_positions": 3}},
    {"id": "bot_vesta",    "name": "VESTA",    "capital": 100000,
     "strategy": {"score_min": 72, "require_funding_neg": True, "bull_pct_min": 52, "direction": "LONG",  "sl_pct": 0.006, "tp_pct": 0.015, "stake": 700,  "max_positions": 2}},
    {"id": "bot_marco",    "name": "MARCO",    "capital": 100000,
     "strategy": {"score_min": 70, "grade_required": ["A+", "A", "B"], "require_ist_min": 62, "direction": "BOTH",  "sl_pct": 0.007, "tp_pct": 0.016, "stake": 500,  "max_positions": 2}},
    {"id": "bot_brutus",   "name": "BRUTUS",   "capital": 100000,
     "strategy": {"score_min": 68, "grade_required": ["A+", "A"], "direction": "SHORT", "sl_pct": 0.005, "tp_pct": 0.014, "stake": 600,  "max_positions": 2}},
    {"id": "bot_seneca",   "name": "SENECA",   "capital": 100000,
     "strategy": {"score_min": 74, "grade_required": ["A+", "A"], "require_ist_min": 62, "require_funding_neg": True, "direction": "BOTH",  "sl_pct": 0.005, "tp_pct": 0.013, "stake": 600,  "max_positions": 2}},
    {"id": "bot_cicero",   "name": "CICERO",   "capital": 100000,
     "strategy": {"score_min": 77, "grade_required": ["A+"], "require_ist_min": 70, "require_oi_increase": True, "direction": "BOTH",  "sl_pct": 0.004, "tp_pct": 0.010, "stake": 1000, "max_positions": 1}},
]

BOT_BY_ID: dict[str, dict] = {b["id"]: b for b in BOT_PROFILES}

# Altcoins excluídas do filtro altcoin_only
_MAJOR = {"BTC", "ETH", "BNB"}

_running = False


# ── Aprendizado adaptativo ────────────────────────────────────────────────────

def _get_learned(wallet: dict) -> dict:
    """Extrai estado de aprendizado salvo em positions['_learned']."""
    return wallet.get("positions", {}).get("_learned", {
        "score_min_adj": 0.0,
        "stake_mult":    1.0,
        "trades_avaliados": 0,
    })


def _set_learned(wallet: dict, learned: dict) -> dict:
    positions = dict(wallet.get("positions", {}))
    positions["_learned"] = learned
    return {**wallet, "positions": positions}


def _apply_learning(bot_id: str, wallet: dict, recent_trades: list[dict]) -> dict:
    """Avalia WR dos últimos 10 trades e ajusta score_min_adj / stake_mult."""
    learned = _get_learned(wallet)
    vendas = [t for t in recent_trades if t.get("tipo") == "V"]
    if len(vendas) < 10:
        return wallet

    # Janela dos últimos 10 fechados não avaliados ainda
    avaliados = int(learned.get("trades_avaliados", 0))
    novos = vendas[avaliados:]
    if len(novos) < 10:
        return wallet

    janela = novos[:10]
    wins = sum(1 for t in janela if (t.get("pnl_brl") or 0) > 0)
    wr = wins / 10

    adj = float(learned.get("score_min_adj", 0))
    mult = float(learned.get("stake_mult", 1.0))

    if wr < 0.40:
        adj  = min(adj + 2, 15)   # eleva score até +15
        mult = max(mult - 0.05, 0.5)
        print(f"[BotWorker] {bot_id} aprendizado: WR={wr*100:.0f}% → score_adj+2={adj:.0f} stake_mult={mult:.2f}")
    elif wr >= 0.65:
        adj  = max(adj - 1, 0)
        mult = min(mult + 0.05, 2.0)
        print(f"[BotWorker] {bot_id} aprendizado: WR={wr*100:.0f}% → score_adj-1={adj:.0f} stake_mult={mult:.2f}")

    learned = {
        "score_min_adj":    adj,
        "stake_mult":       mult,
        "trades_avaliados": avaliados + 10,
    }
    return _set_learned(wallet, learned)


# ── Lógica de entrada ─────────────────────────────────────────────────────────

def _pode_entrar(bot: dict, it: dict, wallet: dict, learned: dict) -> Optional[str]:
    """Retorna direction se o bot pode abrir posição, None caso contrário."""
    strat     = bot["strategy"]
    score     = it.get("score_final", 0)
    grade     = it.get("grade", "NR")
    ist       = it.get("ist", 0) or 0
    funding   = it.get("funding_rate", 0) or 0
    oi_chg    = it.get("oi_change_pct", 0) or 0
    cvd_bull  = it.get("cvd_bullish", False)
    bull_pct  = it.get("bull_pct", 50)
    direction = it.get("direction", "NEUTRO")
    simbolo   = it.get("simbolo", "")

    allowed   = strat["direction"]
    score_min = strat["score_min"] + float(learned.get("score_min_adj", 0))
    score_max = strat.get("score_max")

    # Score fora do range
    if score < score_min:
        return None
    if score_max and score > score_max:
        return None

    # Grade obrigatória
    grade_req = strat.get("grade_required")
    if grade_req and grade not in grade_req:
        return None

    # IST mínimo
    ist_min = strat.get("require_ist_min")
    if ist_min and ist < ist_min:
        return None

    # Funding negativo obrigatório
    if strat.get("require_funding_neg") and funding >= 0:
        return None

    # OI crescente obrigatório
    if strat.get("require_oi_increase") and oi_chg <= 0:
        return None

    # CVD bullish obrigatório
    if strat.get("require_cvd_bullish") and not cvd_bull:
        return None

    # bull_pct
    bull_min = strat.get("bull_pct_min")
    bull_max = strat.get("bull_pct_max")
    if bull_min and bull_pct < bull_min:
        return None
    if bull_max and bull_pct > bull_max:
        return None

    # Altcoin only
    if strat.get("altcoin_only"):
        base = simbolo.replace("USDT", "").replace("BUSD", "")
        if base in _MAJOR:
            return None

    # Direção do mercado
    if direction == "NEUTRO":
        return None
    if allowed == "LONG" and direction != "LONG":
        return None
    if allowed == "SHORT" and direction != "SHORT":
        return None

    # Max posições abertas
    posicoes_reais = {k: v for k, v in wallet.get("positions", {}).items() if k != "_learned"}
    if len(posicoes_reais) >= strat["max_positions"]:
        return None

    # Saldo mínimo
    if wallet.get("saldo_livre", 0) < 50:
        return None

    return direction


def _abrir(bot: dict, simbolo: str, price_brl: float, usd_brl: float,
           score: float, grade: str, direction: str, wallet: dict, learned: dict) -> tuple[dict, dict]:
    strat      = bot["strategy"]
    stake_base = strat["stake"]
    mult       = float(learned.get("stake_mult", 1.0))
    amount     = min(stake_base * mult, wallet["saldo_livre"])
    if amount < 50:
        return wallet, {}

    fee   = amount * FEE_RATE
    units = (amount - fee) / price_brl
    sl_pct = strat["sl_pct"]
    tp_pct = strat["tp_pct"]

    if direction == "LONG":
        sl_price = price_brl * (1 - sl_pct)
        tp_price = price_brl * (1 + tp_pct)
    else:
        sl_price = price_brl * (1 + sl_pct)
        tp_price = price_brl * (1 - tp_pct)

    now_ms = int(time.time() * 1000)
    pos = {
        "simbolo":           simbolo,
        "direction":         direction,
        "units":             units,
        "amount_brl":        amount,
        "entry_price_brl":   price_brl,
        "last_price_brl":    price_brl,
        "last_usd_brl":      usd_brl,
        "time":              now_ms,
        "score_entry":       score,
        "stop_loss_price":   sl_price,
        "take_profit_price": tp_price,
        "sl_pct":            sl_pct,
        "tp_pct":            tp_pct,
    }
    trade = {
        "id":             f"{now_ms}-{bot['id']}-{simbolo}-C",
        "perfil_id":      bot["id"],
        "simbolo":        simbolo,
        "tipo":           "C",
        "direction":      direction,
        "price_brl":      price_brl,
        "amount_brl":     amount,
        "fee":            fee,
        "score":          score,
        "grade":          grade,
        "auto":           True,
        "time":           now_ms,
        "motivo_entrada": f"Bot {bot['name']} | Score {score:.1f} | Grade {grade} | {direction}",
    }
    positions = {**wallet.get("positions", {}), simbolo: pos}
    wallet = {**wallet, "saldo_livre": wallet["saldo_livre"] - amount, "positions": positions}
    return wallet, trade


def _fechar(bot: dict, simbolo: str, price_brl: float, usd_brl: float,
            score: float, motivo: str, wallet: dict) -> tuple[dict, dict]:
    pos = wallet.get("positions", {}).get(simbolo)
    if not pos:
        return wallet, {}

    sell_value = pos["units"] * price_brl
    if pos["direction"] == "LONG":
        pnl = sell_value - pos["amount_brl"]
    else:
        pnl = pos["amount_brl"] - sell_value

    pct    = (pnl / pos["amount_brl"]) * 100 if pos["amount_brl"] else 0
    now_ms = int(time.time() * 1000)

    trade = {
        "id":           f"{now_ms}-{bot['id']}-{simbolo}-V",
        "perfil_id":    bot["id"],
        "simbolo":      simbolo,
        "tipo":         "V",
        "direction":    pos["direction"],
        "price_brl":    price_brl,
        "amount_brl":   sell_value,
        "pnl_brl":      pnl,
        "pct":          pct,
        "score":        score,
        "auto":         True,
        "time":         now_ms,
        "motivo_saida": motivo,
    }
    positions = {k: v for k, v in wallet.get("positions", {}).items() if k != simbolo}
    devolver  = pos["amount_brl"] + pnl
    wallet    = {**wallet, "saldo_livre": wallet["saldo_livre"] + devolver, "positions": positions}
    return wallet, trade


# ── Worker loop ───────────────────────────────────────────────────────────────

async def _processar_ciclo_bots() -> None:
    from ..api.cripto_futures import _CACHE as FUT_CACHE, get_futures_scan

    # Usa cache se disponível e frescos (20 min)
    scan_data: dict | None = None
    cached = FUT_CACHE.get("ft:scan")
    if cached:
        ts, sd = cached
        if time.time() - ts <= 20 * 60:
            scan_data = sd

    if scan_data is None:
        print("[BotWorker] Buscando scan fresco da Binance...")
        try:
            scan_data = await get_futures_scan()
        except Exception as e:
            print(f"[BotWorker] Falha ao buscar scan: {e} — aguardando próximo ciclo")
            return

    geral: list[dict] = scan_data.get("geral", [])
    if not geral:
        print("[BotWorker] Scan vazio")
        return

    usd_brl: float = scan_data.get("usd_brl") or 5.2
    scan_by_sym = {it["simbolo"]: it for it in geral if it.get("preco")}

    # Carrega todas as wallets de bots e trades do MySQL
    wallets    = await wallet_load_all("bot")
    all_trades = await trades_list(tipo="bot", limit=5000)
    trades_by_bot: dict[str, list] = {}
    for t in all_trades:
        pid = t.get("perfil_id", "")
        trades_by_bot.setdefault(pid, []).append(t)

    total_trades_salvos = 0

    for bot in BOT_PROFILES:
        bid = bot["id"]
        cap = bot.get("capital", 100000)

        if bid not in wallets:
            wallets[bid] = {"saldo_inicial": cap, "saldo_livre": cap, "positions": {}}

        wallet = dict(wallets[bid])
        wallet["positions"] = dict(wallet.get("positions", {}))

        # Aprendizado: ajusta score_min_adj / stake_mult se tiver ≥10 novos trades
        bot_trades = trades_by_bot.get(bid, [])
        wallet = _apply_learning(bid, wallet, bot_trades)

        learned = _get_learned(wallet)
        trades_to_save: list[dict] = []

        # 1) Fechar posições abertas (SL / TP / reversão de direção)
        posicoes_reais = {k: v for k, v in wallet["positions"].items() if k != "_learned"}
        for sym in list(posicoes_reais.keys()):
            pos = wallet["positions"].get(sym)
            if not pos:
                continue
            it = scan_by_sym.get(sym)
            if not it:
                continue

            curr_brl = (it.get("preco") or 0) * usd_brl
            if not curr_brl:
                continue

            score     = it.get("score_final", 50)
            direction = pos["direction"]
            sl_price  = pos.get("stop_loss_price")
            tp_price  = pos.get("take_profit_price")

            motivo = None
            if direction == "LONG":
                if sl_price and curr_brl <= sl_price:
                    motivo = f"Stop Loss {bot['strategy']['sl_pct']*100:.1f}%"
                elif tp_price and curr_brl >= tp_price:
                    motivo = f"Take Profit {bot['strategy']['tp_pct']*100:.1f}%"
                elif it.get("direction") == "SHORT" and score > 70:
                    motivo = "Reversão SHORT"
            else:
                if sl_price and curr_brl >= sl_price:
                    motivo = f"Stop Loss SHORT {bot['strategy']['sl_pct']*100:.1f}%"
                elif tp_price and curr_brl <= tp_price:
                    motivo = f"Take Profit SHORT {bot['strategy']['tp_pct']*100:.1f}%"
                elif it.get("direction") == "LONG" and score > 70:
                    motivo = "Reversão LONG"

            if motivo:
                wallet, trade = _fechar(bot, sym, curr_brl, usd_brl, score, motivo, wallet)
                if trade:
                    trades_to_save.append(trade)

        # 2) Abrir nova posição (máximo 1 por ciclo por bot)
        for it in sorted(geral, key=lambda x: x.get("score_final", 0), reverse=True):
            sym = it["simbolo"]
            if sym in wallet["positions"]:
                continue

            direction = _pode_entrar(bot, it, wallet, learned)
            if not direction:
                continue

            price_brl = (it.get("preco") or 0) * usd_brl
            if not price_brl:
                continue

            score = it.get("score_final", 0)
            grade = it.get("grade", "NR")

            wallet, trade = _abrir(bot, sym, price_brl, usd_brl, score, grade, direction, wallet, learned)
            if trade:
                trades_to_save.append(trade)
                break  # uma entrada por ciclo

        # 3) Salvar MySQL — somente se houve ação neste ciclo
        wallets[bid] = wallet
        if trades_to_save:
            await wallet_upsert(bid, "bot", wallet.get("saldo_inicial", cap), wallet["saldo_livre"], wallet["positions"])
            for t in trades_to_save:
                await trade_insert(t, "bot")
                total_trades_salvos += 1
                print(f"[BotWorker] {bid} | {t['tipo']} {t.get('simbolo')} {t.get('direction')} R${t.get('amount_brl',0):.0f}")

    print(f"[BotWorker] Ciclo concluído — {len(BOT_PROFILES)} bots | {total_trades_salvos} trades")


async def bot_trade_loop() -> None:
    """Loop infinito — iniciado no lifespan do FastAPI."""
    global _running
    if _running:
        return
    _running = True
    print(f"[BotWorker] Worker iniciado — ciclo a cada {INTERVAL//60} minutos")
    # Aguarda 30s para o futures worker já ter buscado o scan
    await asyncio.sleep(30)
    while True:
        try:
            await _processar_ciclo_bots()
        except Exception as e:
            print(f"[BotWorker] Erro no ciclo: {e}")
        await asyncio.sleep(INTERVAL)
