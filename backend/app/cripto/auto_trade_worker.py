"""
Auto-Trade Worker — roda em background no Railway 24/7.
A cada INTERVAL segundos: busca scan, processa todas as carteiras, salva no MySQL.
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
    wallet_reset,
    wallet_upsert,
)

INTERVAL = 10 * 60   # 10 minutos
FEE_RATE = 0.0004    # 0.04% taxa futures

# ── Perfis — espelho exato do frontend PERFIS_FUTURES ────────────────────────

PERFIS: list[dict] = [
    {"id": "f_cons_normal",  "nome": "Conservador Normal",      "score_compra": 68, "score_venda": 45, "bull_pct_min": 53, "sl_pct": 0.008, "tp_pct": 0.020, "stake_base": 1000, "capital_inicial": 100000, "direction_allowed": "BOTH",  "aguardar_ok": True,  "apenas_aguardar": False},
    {"id": "f_cons_pro",     "nome": "Conservador PRO",         "score_compra": 65, "score_venda": 42, "bull_pct_min": 51, "sl_pct": 0.009, "tp_pct": 0.025, "stake_base": 1000, "capital_inicial": 100000, "direction_allowed": "BOTH",  "aguardar_ok": True,  "apenas_aguardar": False},
    {"id": "f_cons_promax",  "nome": "Conservador PRO MAX",     "score_compra": 62, "score_venda": 40, "bull_pct_min": 49, "sl_pct": 0.010, "tp_pct": 0.030, "stake_base": 1000, "capital_inicial": 100000, "direction_allowed": "BOTH",  "aguardar_ok": True,  "apenas_aguardar": False},
    {"id": "f_mod_normal",   "nome": "Moderado Normal",         "score_compra": 60, "score_venda": 38, "bull_pct_min": 47, "sl_pct": 0.010, "tp_pct": 0.025, "stake_base": 1000, "capital_inicial": 100000, "direction_allowed": "BOTH",  "aguardar_ok": True,  "apenas_aguardar": False},
    {"id": "f_mod_pro",      "nome": "Moderado PRO",            "score_compra": 55, "score_venda": 37, "bull_pct_min": 45, "sl_pct": 0.012, "tp_pct": 0.030, "stake_base": 1000, "capital_inicial": 100000, "direction_allowed": "BOTH",  "aguardar_ok": True,  "apenas_aguardar": False},
    {"id": "f_mod_promax",   "nome": "Moderado PRO MAX",        "score_compra": 52, "score_venda": 35, "bull_pct_min": 43, "sl_pct": 0.013, "tp_pct": 0.035, "stake_base": 1000, "capital_inicial": 100000, "direction_allowed": "BOTH",  "aguardar_ok": True,  "apenas_aguardar": False},
    {"id": "f_agr_normal",   "nome": "Agressivo Normal",        "score_compra": 48, "score_venda": 33, "bull_pct_min": 41, "sl_pct": 0.013, "tp_pct": 0.035, "stake_base": 1000, "capital_inicial": 100000, "direction_allowed": "BOTH",  "aguardar_ok": True,  "apenas_aguardar": False},
    {"id": "f_agr_pro",      "nome": "Agressivo PRO",           "score_compra": 45, "score_venda": 32, "bull_pct_min": 39, "sl_pct": 0.015, "tp_pct": 0.040, "stake_base": 1000, "capital_inicial": 100000, "direction_allowed": "BOTH",  "aguardar_ok": True,  "apenas_aguardar": False},
    {"id": "f_agr_promax",   "nome": "Agressivo PRO MAX",       "score_compra": 42, "score_venda": 30, "bull_pct_min": 37, "sl_pct": 0.017, "tp_pct": 0.050, "stake_base": 1000, "capital_inicial": 100000, "direction_allowed": "BOTH",  "aguardar_ok": True,  "apenas_aguardar": False},
    {"id": "f_cons_alav",    "nome": "Conservador Alavancado",  "score_compra": 72, "score_venda": 50, "bull_pct_min": 54, "sl_pct": 0.006, "tp_pct": 0.015, "stake_base": 5000, "stake_dupla": 87, "capital_inicial": 100000, "direction_allowed": "BOTH",  "aguardar_ok": True,  "apenas_aguardar": False},
    {"id": "f_mod_alav",     "nome": "Moderado Alavancado",     "score_compra": 68, "score_venda": 47, "bull_pct_min": 52, "sl_pct": 0.007, "tp_pct": 0.018, "stake_base": 5000, "stake_dupla": 83, "capital_inicial": 100000, "direction_allowed": "BOTH",  "aguardar_ok": True,  "apenas_aguardar": False},
    {"id": "f_agr_alav",     "nome": "Agressivo Alavancado",    "score_compra": 63, "score_venda": 43, "bull_pct_min": 48, "sl_pct": 0.008, "tp_pct": 0.020, "stake_base": 5000, "stake_dupla": 80, "capital_inicial": 100000, "direction_allowed": "BOTH",  "aguardar_ok": True,  "apenas_aguardar": False},
    {"id": "f_sub_cons",     "nome": "Subida Normal",           "score_compra": 48, "score_max": 79, "score_venda": 33, "bull_pct_min": 51, "sl_pct": 0.010, "tp_pct": 0.035, "stake_base": 500, "capital_inicial": 100000, "direction_allowed": "LONG", "aguardar_ok": False, "apenas_aguardar": True},
    {"id": "f_sub_mod",      "nome": "Subida PRO",              "score_compra": 40, "score_max": 79, "score_venda": 30, "bull_pct_min": 48, "sl_pct": 0.012, "tp_pct": 0.040, "stake_base": 500, "capital_inicial": 100000, "direction_allowed": "LONG", "aguardar_ok": False, "apenas_aguardar": True},
    {"id": "f_sub_agr",      "nome": "Subida PRO MAX",          "score_compra": 35, "score_max": 79, "score_venda": 28, "bull_pct_min": 45, "sl_pct": 0.015, "tp_pct": 0.050, "stake_base": 500, "capital_inicial": 100000, "direction_allowed": "LONG", "aguardar_ok": False, "apenas_aguardar": True},
    {"id": "f_short_cons",   "nome": "Short Conservador",       "score_compra": 68, "score_venda": 45, "bull_pct_min": 40, "sl_pct": 0.008, "tp_pct": 0.020, "stake_base": 500, "capital_inicial": 100000, "direction_allowed": "SHORT", "aguardar_ok": True,  "apenas_aguardar": False},
    {"id": "f_short_mod",    "nome": "Short Moderado",          "score_compra": 60, "score_venda": 40, "bull_pct_min": 35, "sl_pct": 0.010, "tp_pct": 0.025, "stake_base": 500, "capital_inicial": 100000, "direction_allowed": "SHORT", "aguardar_ok": True,  "apenas_aguardar": False},
]

PERFIS_BY_ID: dict[str, dict] = {p["id"]: p for p in PERFIS}

_running = False


# ── Lógica de trade ───────────────────────────────────────────────────────────

def _pode_entrar(cfg: dict, it: dict, wallet: dict) -> Optional[str]:
    """Retorna a direction se pode abrir posição, None caso contrário."""
    score     = it.get("score_final", 0)
    bull_pct  = it.get("bull_pct", 50)
    direction = it.get("direction", "NEUTRO")
    operar    = it.get("operar", False)
    decisao   = it.get("decisao", "AGUARDAR")

    allowed   = cfg["direction_allowed"]
    score_min = cfg["score_compra"]
    score_max = cfg.get("score_max")          # perfis Subida só entra até score_max
    bull_min  = cfg["bull_pct_min"]
    apenas_ag = cfg.get("apenas_aguardar", False)
    aguardar_ok = cfg.get("aguardar_ok", False)

    # Score fora do range
    if score < score_min:
        return None
    if score_max and score > score_max:
        return None

    # Verificação de decisão
    if apenas_ag:
        if decisao not in ("AGUARDAR",):
            return None
    else:
        if not operar and not (aguardar_ok and decisao == "AGUARDAR"):
            return None

    # Saldo insuficiente
    if wallet["saldo_livre"] < 50:
        return None

    # Determina direction válida
    if direction == "NEUTRO":
        return None

    if allowed == "LONG" and direction != "LONG":
        return None
    if allowed == "SHORT" and direction != "SHORT":
        return None

    # Validação bull_pct
    if direction == "LONG" and bull_pct < bull_min:
        return None
    if direction == "SHORT" and bull_pct > (100 - bull_min):
        return None

    return direction


def _abrir(cfg: dict, simbolo: str, price_brl: float, usd_brl: float,
           score: float, direction: str, grade: str, wallet: dict) -> tuple[dict, dict]:
    """Abre posição e retorna (wallet_atualizado, trade)."""
    stake_base = cfg.get("stake_base", 1000)
    stake_dupla = cfg.get("stake_dupla")
    stake = stake_base * 2 if (stake_dupla and score >= stake_dupla) else stake_base
    amount = min(stake, wallet["saldo_livre"])
    if amount < 50:
        return wallet, {}

    fee   = amount * FEE_RATE
    units = (amount - fee) / price_brl

    sl_pct = cfg["sl_pct"]
    tp_pct = cfg["tp_pct"]

    if direction == "LONG":
        sl_price = price_brl * (1 - sl_pct)
        tp_price = price_brl * (1 + tp_pct)
    else:
        sl_price = price_brl * (1 + sl_pct)
        tp_price = price_brl * (1 - tp_pct)

    now_ms = int(time.time() * 1000)
    pos = {
        "simbolo":          simbolo,
        "direction":        direction,
        "units":            units,
        "amount_brl":       amount,
        "entry_price_brl":  price_brl,
        "last_price_brl":   price_brl,
        "last_usd_brl":     usd_brl,
        "time":             now_ms,
        "score_entry":      score,
        "stop_loss_price":  sl_price,
        "take_profit_price": tp_price,
        "sl_pct":           sl_pct,
        "tp_pct":           tp_pct,
    }
    trade = {
        "id":             f"{now_ms}-{cfg['id']}-{simbolo}-C",
        "perfil_id":      cfg["id"],
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
        "motivo_entrada": f"Score {score:.1f} | {cfg['nome']} | {direction}" + (" | STAKE DOBRADA" if (stake_dupla and score >= stake_dupla) else ""),
    }
    wallet = {
        **wallet,
        "saldo_livre": wallet["saldo_livre"] - amount,
        "positions":   {**wallet["positions"], simbolo: pos},
    }
    return wallet, trade


def _fechar(cfg: dict, simbolo: str, price_brl: float, usd_brl: float,
            score: float, motivo: str, wallet: dict) -> tuple[dict, dict]:
    """Fecha posição e retorna (wallet_atualizado, trade)."""
    pos = wallet["positions"].get(simbolo)
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
        "id":            f"{now_ms}-{cfg['id']}-{simbolo}-V",
        "perfil_id":     cfg["id"],
        "simbolo":       simbolo,
        "tipo":          "V",
        "direction":     pos["direction"],
        "price_brl":     price_brl,
        "amount_brl":    sell_value,
        "pnl_brl":       pnl,
        "pct":           pct,
        "score":         score,
        "auto":          True,
        "time":          now_ms,
        "motivo_saida":  motivo,
    }
    positions = {k: v for k, v in wallet["positions"].items() if k != simbolo}
    devolver  = pos["amount_brl"] + pnl
    wallet    = {
        **wallet,
        "saldo_livre": wallet["saldo_livre"] + devolver,
        "positions":   positions,
    }
    return wallet, trade


# ── Worker loop ───────────────────────────────────────────────────────────────

async def _processar_ciclo() -> None:
    """Executa um ciclo completo: busca scan → processa wallets → salva."""
    from .cripto_futures import _CACHE as FUT_CACHE  # cache interno do scan

    # Pega scan mais recente do cache em memória
    cached = FUT_CACHE.get("ft:scan")
    if not cached:
        print("[AutoTrade] Sem scan em cache — aguardando próximo ciclo")
        return

    ts, scan_data = cached
    if time.time() - ts > 20 * 60:  # scan com mais de 20 min = stale
        print("[AutoTrade] Scan stale — aguardando refresh")
        return

    geral: list[dict] = scan_data.get("geral", [])
    if not geral:
        print("[AutoTrade] Scan vazio")
        return

    usd_brl: float = scan_data.get("usd_brl", 5.2)
    scan_by_sym = {it["simbolo"]: it for it in geral}

    # Carrega wallets do MySQL
    wallets = await wallet_load_all("futures")

    for cfg in PERFIS:
        pid = cfg["id"]
        cap = cfg.get("capital_inicial", 100000)

        # Inicializa wallet se não existir
        if pid not in wallets:
            wallets[pid] = {"saldo_inicial": cap, "saldo_livre": cap, "positions": {}}

        wallet = dict(wallets[pid])
        wallet["positions"] = dict(wallet.get("positions", {}))
        trades_to_save: list[dict] = []

        # 1) Verificar posições abertas → SL / TP / reversão
        for sym in list(wallet["positions"].keys()):
            pos = wallet["positions"][sym]
            it  = scan_by_sym.get(sym)
            if not it:
                continue

            curr_brl  = it["preco"] * usd_brl
            score     = it.get("score_final", 50)
            direction = pos["direction"]
            sl_price  = pos.get("stop_loss_price")
            tp_price  = pos.get("take_profit_price")

            motivo = None
            if direction == "LONG":
                if sl_price and curr_brl <= sl_price:
                    motivo = f"Stop Loss {(cfg['sl_pct']*100):.1f}%"
                elif tp_price and curr_brl >= tp_price:
                    motivo = f"Take Profit {(cfg['tp_pct']*100):.1f}%"
                elif it.get("direction") == "SHORT" and score > 65:
                    motivo = "Reversão SHORT"
            else:  # SHORT
                if sl_price and curr_brl >= sl_price:
                    motivo = f"Stop Loss SHORT {(cfg['sl_pct']*100):.1f}%"
                elif tp_price and curr_brl <= tp_price:
                    motivo = f"Take Profit SHORT {(cfg['tp_pct']*100):.1f}%"
                elif it.get("direction") == "LONG" and score > 65:
                    motivo = "Reversão LONG"

            if motivo:
                wallet, trade = _fechar(cfg, sym, curr_brl, usd_brl, score, motivo, wallet)
                if trade:
                    trades_to_save.append(trade)

        # 2) Verificar novos sinais → abrir posições
        for it in geral:
            sym = it["simbolo"]
            if sym in wallet["positions"]:
                continue  # já tem posição aberta

            direction = _pode_entrar(cfg, it, wallet)
            if not direction:
                continue

            price_brl = it["preco"] * usd_brl
            score     = it.get("score_final", 0)
            grade     = it.get("grade", "")

            wallet, trade = _abrir(cfg, sym, price_brl, usd_brl, score, direction, grade, wallet)
            if trade:
                trades_to_save.append(trade)
                break  # uma entrada por ciclo por perfil (evita abrir tudo de uma vez)

        # 3) Salvar no MySQL
        wallets[pid] = wallet
        await wallet_upsert(pid, "futures", wallet["saldo_inicial"], wallet["saldo_livre"], wallet["positions"])
        for t in trades_to_save:
            await trade_insert(t, "futures")
            print(f"[AutoTrade] {pid} | {t['tipo']} {t.get('simbolo')} {t.get('direction')} R${t.get('amount_brl',0):.0f} | {t.get('motivo_entrada') or t.get('motivo_saida')}")

    print(f"[AutoTrade] Ciclo concluído — {len(PERFIS)} perfis processados")


async def auto_trade_loop() -> None:
    """Loop infinito — chamado no startup do FastAPI."""
    global _running
    if _running:
        return
    _running = True
    print(f"[AutoTrade] Worker iniciado — ciclo a cada {INTERVAL//60} minutos")
    while True:
        try:
            await _processar_ciclo()
        except Exception as e:
            print(f"[AutoTrade] Erro no ciclo: {e}")
        await asyncio.sleep(INTERVAL)
