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

# ── Perfis — espelho exato do frontend PERFIS_FUTURES (v2 sub-scores) ────────

# long_filter / short_filter: thresholds mínimos/máximos por sub-score.
# LONG: tec_min, flx_min, ctx_min, fnd_min  → todos devem ser ≥ ao mínimo
# SHORT: tec_max, flx_max (bearish) + ctx_min, fnd_min → TEC/FLX ≤ máximo

PERFIS: list[dict] = [
    # ── Conservador ──────────────────────────────────────────────────────────
    {"id": "f_cons_normal", "nome": "Conservador Normal",
     "score_venda": 45, "bull_pct_min": 53, "sl_pct": 0.008, "tp_pct": 0.020,
     "stake_base": 1000, "capital_inicial": 100000, "direction_allowed": "BOTH",
     "aguardar_ok": True, "apenas_aguardar": False,
     "grade_required": ["A+","A"], "require_ist_min": 55,
     "long_filter":  {"tec_min": 65, "flx_min": 60, "ctx_min": 60, "fnd_min": 48},
     "short_filter": {"tec_max": 38, "flx_max": 42, "ctx_min": 55, "fnd_min": 45}},
    {"id": "f_cons_pro", "nome": "Conservador PRO",
     "score_venda": 42, "bull_pct_min": 51, "sl_pct": 0.009, "tp_pct": 0.025,
     "stake_base": 1000, "capital_inicial": 100000, "direction_allowed": "BOTH",
     "aguardar_ok": True, "apenas_aguardar": False,
     "grade_required": ["A+","A"], "require_ist_min": 50,
     "long_filter":  {"tec_min": 62, "flx_min": 57, "ctx_min": 57, "fnd_min": 45},
     "short_filter": {"tec_max": 40, "flx_max": 45, "ctx_min": 52, "fnd_min": 42}},
    {"id": "f_cons_promax", "nome": "Conservador PRO MAX",
     "score_venda": 40, "bull_pct_min": 49, "sl_pct": 0.010, "tp_pct": 0.030,
     "stake_base": 1000, "capital_inicial": 100000, "direction_allowed": "BOTH",
     "aguardar_ok": True, "apenas_aguardar": False,
     "grade_required": ["A+","A","B"], "require_ist_min": 45,
     "long_filter":  {"tec_min": 58, "flx_min": 53, "ctx_min": 53, "fnd_min": 40},
     "short_filter": {"tec_max": 44, "flx_max": 50, "ctx_min": 48, "fnd_min": 38}},
    # ── Moderado ─────────────────────────────────────────────────────────────
    {"id": "f_mod_normal", "nome": "Moderado Normal",
     "score_venda": 38, "bull_pct_min": 47, "sl_pct": 0.010, "tp_pct": 0.025,
     "stake_base": 1000, "capital_inicial": 100000, "direction_allowed": "BOTH",
     "aguardar_ok": True, "apenas_aguardar": False,
     "grade_required": ["A+","A","B"],
     "long_filter":  {"tec_min": 55, "flx_min": 50, "ctx_min": 50, "fnd_min": 35},
     "short_filter": {"tec_max": 48, "flx_max": 54, "ctx_min": 44, "fnd_min": 32}},
    {"id": "f_mod_pro", "nome": "Moderado PRO",
     "score_venda": 37, "bull_pct_min": 45, "sl_pct": 0.012, "tp_pct": 0.030,
     "stake_base": 1000, "capital_inicial": 100000, "direction_allowed": "BOTH",
     "aguardar_ok": True, "apenas_aguardar": False,
     "grade_required": ["A+","A","B","C"],
     "long_filter":  {"tec_min": 50, "flx_min": 46, "ctx_min": 46, "fnd_min": 30},
     "short_filter": {"tec_max": 52, "flx_max": 58, "ctx_min": 40, "fnd_min": 27}},
    {"id": "f_mod_promax", "nome": "Moderado PRO MAX",
     "score_venda": 35, "bull_pct_min": 43, "sl_pct": 0.013, "tp_pct": 0.035,
     "stake_base": 1000, "capital_inicial": 100000, "direction_allowed": "BOTH",
     "aguardar_ok": True, "apenas_aguardar": False,
     "long_filter":  {"tec_min": 46, "flx_min": 42, "ctx_min": 42, "fnd_min": 25},
     "short_filter": {"tec_max": 57, "flx_max": 63, "ctx_min": 36, "fnd_min": 22}},
    # ── Agressivo ────────────────────────────────────────────────────────────
    {"id": "f_agr_normal", "nome": "Agressivo Normal",
     "score_venda": 33, "bull_pct_min": 41, "sl_pct": 0.013, "tp_pct": 0.035,
     "stake_base": 1000, "capital_inicial": 100000, "direction_allowed": "BOTH",
     "aguardar_ok": True, "apenas_aguardar": False,
     "long_filter":  {"tec_min": 42, "flx_min": 38, "ctx_min": 38, "fnd_min": 20},
     "short_filter": {"tec_max": 62, "flx_max": 68, "ctx_min": 30, "fnd_min": 18}},
    {"id": "f_agr_pro", "nome": "Agressivo PRO",
     "score_venda": 32, "bull_pct_min": 39, "sl_pct": 0.015, "tp_pct": 0.040,
     "stake_base": 1000, "capital_inicial": 100000, "direction_allowed": "BOTH",
     "aguardar_ok": True, "apenas_aguardar": False,
     "long_filter":  {"tec_min": 38, "flx_min": 35, "ctx_min": 35, "fnd_min": 17},
     "short_filter": {"tec_max": 67, "flx_max": 73, "ctx_min": 27, "fnd_min": 15}},
    {"id": "f_agr_promax", "nome": "Agressivo PRO MAX",
     "score_venda": 30, "bull_pct_min": 37, "sl_pct": 0.017, "tp_pct": 0.050,
     "stake_base": 1000, "capital_inicial": 100000, "direction_allowed": "BOTH",
     "aguardar_ok": True, "apenas_aguardar": False,
     "long_filter":  {"tec_min": 34, "flx_min": 31, "ctx_min": 31, "fnd_min": 14},
     "short_filter": {"tec_max": 73, "flx_max": 79, "ctx_min": 23, "fnd_min": 12}},
    # ── Alavancado ───────────────────────────────────────────────────────────
    {"id": "f_cons_alav", "nome": "Conservador Alavancado",
     "score_venda": 50, "bull_pct_min": 55, "sl_pct": 0.006, "tp_pct": 0.015,
     "stake_base": 5000, "stake_dupla": 87, "capital_inicial": 100000, "direction_allowed": "BOTH",
     "aguardar_ok": True, "apenas_aguardar": False,
     "grade_required": ["A+"], "require_ist_min": 65,
     "require_funding_neg": True, "require_oi_increase": True,
     "long_filter":  {"tec_min": 70, "flx_min": 65, "ctx_min": 65, "fnd_min": 53},
     "short_filter": {"tec_max": 32, "flx_max": 36, "ctx_min": 60, "fnd_min": 50}},
    {"id": "f_mod_alav", "nome": "Moderado Alavancado",
     "score_venda": 47, "bull_pct_min": 52, "sl_pct": 0.007, "tp_pct": 0.018,
     "stake_base": 5000, "stake_dupla": 83, "capital_inicial": 100000, "direction_allowed": "BOTH",
     "aguardar_ok": True, "apenas_aguardar": False,
     "grade_required": ["A+","A"], "require_ist_min": 58, "require_oi_increase": True,
     "long_filter":  {"tec_min": 66, "flx_min": 60, "ctx_min": 60, "fnd_min": 48},
     "short_filter": {"tec_max": 36, "flx_max": 42, "ctx_min": 55, "fnd_min": 45}},
    {"id": "f_agr_alav", "nome": "Agressivo Alavancado",
     "score_venda": 43, "bull_pct_min": 48, "sl_pct": 0.008, "tp_pct": 0.020,
     "stake_base": 5000, "stake_dupla": 80, "capital_inicial": 100000, "direction_allowed": "BOTH",
     "aguardar_ok": True, "apenas_aguardar": False,
     "grade_required": ["A+","A","B"], "require_ist_min": 50,
     "long_filter":  {"tec_min": 60, "flx_min": 55, "ctx_min": 55, "fnd_min": 43},
     "short_filter": {"tec_max": 42, "flx_max": 48, "ctx_min": 48, "fnd_min": 40}},
    # ── Subida ───────────────────────────────────────────────────────────────
    {"id": "f_sub_cons", "nome": "Subida Normal",
     "score_max": 79, "score_venda": 33, "bull_pct_min": 51, "sl_pct": 0.010, "tp_pct": 0.035,
     "stake_base": 500, "capital_inicial": 100000, "direction_allowed": "LONG",
     "aguardar_ok": False, "apenas_aguardar": True, "require_cvd_bullish": True,
     "long_filter": {"tec_min": 38, "flx_min": 52, "ctx_min": 40, "fnd_min": 25}},
    {"id": "f_sub_mod", "nome": "Subida PRO",
     "score_max": 79, "score_venda": 30, "bull_pct_min": 48, "sl_pct": 0.012, "tp_pct": 0.040,
     "stake_base": 500, "capital_inicial": 100000, "direction_allowed": "LONG",
     "aguardar_ok": False, "apenas_aguardar": True, "require_cvd_bullish": True,
     "long_filter": {"tec_min": 30, "flx_min": 44, "ctx_min": 33, "fnd_min": 20}},
    {"id": "f_sub_agr", "nome": "Subida PRO MAX",
     "score_max": 79, "score_venda": 28, "bull_pct_min": 45, "sl_pct": 0.015, "tp_pct": 0.050,
     "stake_base": 500, "capital_inicial": 100000, "direction_allowed": "LONG",
     "aguardar_ok": False, "apenas_aguardar": True,
     "long_filter": {"tec_min": 22, "flx_min": 36, "ctx_min": 26, "fnd_min": 15}},
    # ── Short ─────────────────────────────────────────────────────────────────
    {"id": "f_short_cons", "nome": "Short Conservador",
     "score_venda": 45, "bull_pct_min": 40, "sl_pct": 0.008, "tp_pct": 0.020,
     "stake_base": 500, "capital_inicial": 100000, "direction_allowed": "SHORT",
     "aguardar_ok": True, "apenas_aguardar": False,
     "grade_required": ["A+","A"],
     "short_filter": {"tec_max": 36, "flx_max": 40, "ctx_min": 55, "fnd_min": 42}},
    {"id": "f_short_mod", "nome": "Short Moderado",
     "score_venda": 40, "bull_pct_min": 35, "sl_pct": 0.010, "tp_pct": 0.025,
     "stake_base": 500, "capital_inicial": 100000, "direction_allowed": "SHORT",
     "aguardar_ok": True, "apenas_aguardar": False,
     "short_filter": {"tec_max": 44, "flx_max": 50, "ctx_min": 46, "fnd_min": 36}},
]

PERFIS_BY_ID: dict[str, dict] = {p["id"]: p for p in PERFIS}

_running = False


# ── Lógica de trade ───────────────────────────────────────────────────────────

def _pode_entrar(cfg: dict, it: dict, wallet: dict) -> Optional[str]:
    """Retorna direction se pode abrir posição, None caso contrário.
    V2: porta de entrada por sub-scores (TEC/FLX/CTX/FND) por direção."""
    bull_pct  = it.get("bull_pct", 50)
    direction = it.get("direction", "NEUTRO")
    operar    = it.get("operar", False)
    decisao   = it.get("decisao", "AGUARDAR")
    grade     = it.get("grade", "NR")
    ist       = it.get("ist", 0) or 0
    funding   = it.get("funding_rate", 0) or 0
    oi_chg    = it.get("oi_change_pct", 0) or 0
    cvd_bull  = it.get("cvd_bullish", False)
    tec       = it.get("score_tecnico", 0) or 0
    flx       = it.get("score_fluxo", 0) or 0
    ctx       = it.get("score_contexto", 0) or 0
    fnd       = it.get("score_fundamental", 0) or 0
    score     = it.get("score_final", 0)

    allowed     = cfg["direction_allowed"]
    score_max   = cfg.get("score_max")
    bull_min    = cfg["bull_pct_min"]
    apenas_ag   = cfg.get("apenas_aguardar", False)
    aguardar_ok = cfg.get("aguardar_ok", False)

    # Teto opcional (perfis Subida: evita entrar quando sinal já pleno)
    if score_max and score > score_max:
        return None

    # Verificação de decisão
    if apenas_ag:
        if decisao != "AGUARDAR":
            return None
    else:
        if not operar and not (aguardar_ok and decisao == "AGUARDAR"):
            return None

    # Saldo insuficiente
    if wallet["saldo_livre"] < 50:
        return None

    # Direction do ativo
    if direction == "NEUTRO":
        return None
    if allowed == "LONG"  and direction != "LONG":
        return None
    if allowed == "SHORT" and direction != "SHORT":
        return None

    # Bull_pct
    if direction == "LONG"  and bull_pct < bull_min:
        return None
    if direction == "SHORT" and bull_pct > (100 - bull_min):
        return None

    # ── Filtros por sub-scores (porta principal v2) ───────────────────────────
    sf_key = "long_filter" if direction == "LONG" else "short_filter"
    sf = cfg.get(sf_key)
    if sf:
        if sf.get("tec_min") is not None and tec < sf["tec_min"]: return None
        if sf.get("tec_max") is not None and tec > sf["tec_max"]: return None
        if sf.get("flx_min") is not None and flx < sf["flx_min"]: return None
        if sf.get("flx_max") is not None and flx > sf["flx_max"]: return None
        if sf.get("ctx_min") is not None and ctx < sf["ctx_min"]: return None
        if sf.get("fnd_min") is not None and fnd < sf["fnd_min"]: return None

    # ── Filtros complementares por indicadores ────────────────────────────────
    grade_req = cfg.get("grade_required")
    if grade_req and grade not in grade_req:
        return None

    ist_min = cfg.get("require_ist_min")
    if ist_min and ist < ist_min:
        return None

    if cfg.get("require_funding_neg") and funding >= 0:
        return None

    if cfg.get("require_oi_increase") and oi_chg <= 0:
        return None

    if cfg.get("require_cvd_bullish") and not cvd_bull:
        return None

    if cfg.get("require_cvd_bearish") and cvd_bull:
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
    from ..api.cripto_futures import _CACHE as FUT_CACHE, get_futures_scan

    # Tenta usar cache primeiro; se vazio ou stale, busca scan fresco da Binance
    scan_data: dict | None = None
    cached = FUT_CACHE.get("ft:scan")
    if cached:
        ts, sd = cached
        if time.time() - ts <= 20 * 60:
            scan_data = sd

    if scan_data is None:
        print("[AutoTrade] Buscando scan fresco da Binance...")
        try:
            scan_data = await get_futures_scan()
        except Exception as e:
            print(f"[AutoTrade] Falha ao buscar scan: {e} — aguardando próximo ciclo")
            return

    geral: list[dict] = scan_data.get("geral", [])
    if not geral:
        print("[AutoTrade] Scan vazio")
        return

    usd_brl: float = scan_data.get("usd_brl") or 5.2
    scan_by_sym = {it["simbolo"]: it for it in geral if it.get("preco")}

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

            curr_brl  = (it.get("preco") or 0) * usd_brl
            if not curr_brl:
                continue
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

            price_brl = (it.get("preco") or 0) * usd_brl
            if not price_brl:
                continue
            score     = it.get("score_final", 0)
            grade     = it.get("grade", "")

            wallet, trade = _abrir(cfg, sym, price_brl, usd_brl, score, direction, grade, wallet)
            if trade:
                trades_to_save.append(trade)
                break  # uma entrada por ciclo por perfil (evita abrir tudo de uma vez)

        # 3) Salvar no MySQL — SOMENTE se houve trades neste ciclo
        # (não sobrescreve MySQL com carteiras zeradas/padrão)
        wallets[pid] = wallet
        if trades_to_save:
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
