"""
Conexão MySQL — banco allwin.mysql.dbaas.com.br
Usado para persistir dados de cripto: sinais, scan, histórico de posições.
"""
from __future__ import annotations

import json
import time
from typing import Any, Optional

import aiomysql

from ..config import settings

_pool: Optional[aiomysql.Pool] = None


async def get_pool() -> aiomysql.Pool:
    global _pool
    if _pool is None:
        _pool = await aiomysql.create_pool(
            host=settings.mysql_host,
            port=settings.mysql_port,
            user=settings.mysql_user,
            password=settings.mysql_password,
            db=settings.mysql_db,
            charset="utf8mb4",
            autocommit=True,
            minsize=2,
            maxsize=10,
            connect_timeout=10,
        )
    return _pool


async def close_pool() -> None:
    global _pool
    if _pool:
        _pool.close()
        await _pool.wait_closed()
        _pool = None


# ── DDL — cria tabelas se não existirem ───────────────────────────────────────

DDL = """
CREATE TABLE IF NOT EXISTS sim_wallets (
    perfil_id     VARCHAR(50)  NOT NULL,
    wallet_tipo   VARCHAR(20)  NOT NULL DEFAULT 'futures',
    saldo_inicial FLOAT        NOT NULL DEFAULT 100000,
    saldo_livre   FLOAT        NOT NULL DEFAULT 100000,
    positions     JSON,
    criado        DATETIME     DEFAULT CURRENT_TIMESTAMP,
    atualizado    DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (perfil_id, wallet_tipo),
    INDEX idx_wt (wallet_tipo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS sim_trades (
    id              VARCHAR(80)  NOT NULL PRIMARY KEY,
    perfil_id       VARCHAR(50)  NOT NULL,
    wallet_tipo     VARCHAR(20)  NOT NULL DEFAULT 'futures',
    simbolo         VARCHAR(20)  NOT NULL,
    tipo            CHAR(1)      NOT NULL,
    direction       VARCHAR(10)  NOT NULL,
    price_brl       FLOAT        NOT NULL,
    amount_brl      FLOAT        NOT NULL,
    fee             FLOAT        DEFAULT 0,
    pnl_brl         FLOAT,
    pct             FLOAT,
    score           FLOAT,
    auto_trade      TINYINT(1)   DEFAULT 1,
    grade           VARCHAR(5),
    motivo_entrada  TEXT,
    motivo_saida    TEXT,
    trade_time      BIGINT       NOT NULL,
    criado_em       DATETIME     DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_st_perfil (perfil_id, wallet_tipo),
    INDEX idx_st_time   (trade_time),
    INDEX idx_st_sim    (simbolo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS ft_sinais (
    id            BIGINT AUTO_INCREMENT PRIMARY KEY,
    simbolo       VARCHAR(20)  NOT NULL,
    direction     VARCHAR(10)  NOT NULL,
    grade         VARCHAR(5)   NOT NULL,
    score_final   FLOAT        NOT NULL,
    dir_conf      FLOAT,
    preco         FLOAT,
    leverage_sug  VARCHAR(20),
    entrada       FLOAT,
    stop_loss     FLOAT,
    take_profit   FLOAT,
    alvo2         FLOAT,
    funding_rate  FLOAT,
    long_pct      FLOAT,
    oi_change_pct FLOAT,
    operar        TINYINT(1)   DEFAULT 0,
    payload       JSON,
    criado_em     DATETIME     DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_simbolo  (simbolo),
    INDEX idx_criado   (criado_em),
    INDEX idx_direction (direction)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS ft_scan_history (
    id          BIGINT AUTO_INCREMENT PRIMARY KEY,
    payload     JSON        NOT NULL,
    total_coins INT,
    top_long    JSON,
    top_short   JSON,
    fear_greed  INT,
    btc_dom     FLOAT,
    criado_em   DATETIME    DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_criado (criado_em)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS ft_posicoes (
    id            BIGINT AUTO_INCREMENT PRIMARY KEY,
    simbolo       VARCHAR(20)  NOT NULL,
    side          VARCHAR(10)  NOT NULL,
    quantidade    FLOAT,
    preco_entrada FLOAT,
    preco_saida   FLOAT,
    leverage      INT,
    pnl_realizado FLOAT,
    status        VARCHAR(20)  DEFAULT 'ABERTA',
    sinal_id      BIGINT,
    aberta_em     DATETIME     DEFAULT CURRENT_TIMESTAMP,
    fechada_em    DATETIME,
    INDEX idx_simbolo (simbolo),
    INDEX idx_status  (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS cerebro_signals (
    id              VARCHAR(80)  NOT NULL PRIMARY KEY,
    simbolo         VARCHAR(20)  NOT NULL,
    direction       VARCHAR(10)  NOT NULL,
    source          VARCHAR(50)  NOT NULL,
    source_perfil   VARCHAR(80),
    score_final     FLOAT,
    score_tecnico   FLOAT,
    score_fluxo     FLOAT,
    score_contexto  FLOAT,
    score_fundamental FLOAT,
    price_entrada   FLOAT,
    tp_pct          FLOAT,
    sl_pct          FLOAT,
    confianca       FLOAT        NOT NULL,
    aprovado        TINYINT(1)   NOT NULL DEFAULT 0,
    motivo          TEXT,
    status          VARCHAR(20)  NOT NULL DEFAULT 'aprovado',
    pnl_pct         FLOAT,
    telegram_entry  TINYINT(1)   DEFAULT 0,
    telegram_exit   TINYINT(1)   DEFAULT 0,
    registrado_em   DATETIME     DEFAULT CURRENT_TIMESTAMP,
    fechado_em      DATETIME,
    INDEX idx_cb_simbolo   (simbolo),
    INDEX idx_cb_status    (status),
    INDEX idx_cb_direction (direction),
    INDEX idx_cb_criado    (registrado_em)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS cripto_alertas (
    id         BIGINT AUTO_INCREMENT PRIMARY KEY,
    simbolo    VARCHAR(20) NOT NULL,
    tipo       VARCHAR(20) NOT NULL,
    preco_alvo FLOAT,
    mensagem   TEXT,
    ativo      TINYINT(1)  DEFAULT 1,
    criado_em  DATETIME    DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_simbolo (simbolo),
    INDEX idx_ativo   (ativo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS ia_analises (
    perfil_id   VARCHAR(50)  NOT NULL,
    wallet_tipo VARCHAR(20)  NOT NULL DEFAULT 'futures',
    analise     JSON,
    criado_em   DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (perfil_id, wallet_tipo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS perfis_overrides (
    perfil_id    VARCHAR(50)  NOT NULL,
    wallet_tipo  VARCHAR(20)  NOT NULL DEFAULT 'futures',
    overrides    JSON,
    aprovado_em  DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (perfil_id, wallet_tipo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
"""


async def init_tables() -> None:
    """Cria tabelas se não existirem."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            for stmt in DDL.strip().split(";"):
                stmt = stmt.strip()
                if stmt:
                    await cur.execute(stmt)


# ── Helpers de escrita ────────────────────────────────────────────────────────

async def salvar_sinal(sinal: dict) -> Optional[int]:
    """Persiste um sinal de futuros no MySQL. Retorna o ID inserido."""
    try:
        pool = await get_pool()
        n = sinal.get("niveis") or {}
        async with pool.acquire() as conn:
            async with conn.cursor() as cur:
                await cur.execute("""
                    INSERT INTO ft_sinais
                      (simbolo, direction, grade, score_final, dir_conf, preco,
                       leverage_sug, entrada, stop_loss, take_profit, alvo2,
                       funding_rate, long_pct, oi_change_pct, operar, payload)
                    VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                """, (
                    sinal.get("simbolo"),
                    sinal.get("direction","NEUTRO"),
                    sinal.get("grade","NR"),
                    sinal.get("score_final", 0),
                    sinal.get("direction_confidence"),
                    sinal.get("preco") or sinal.get("preco_atual"),
                    sinal.get("leverage_suggested"),
                    n.get("entrada"),
                    n.get("stop"),
                    n.get("alvo1"),
                    n.get("alvo2"),
                    sinal.get("funding_rate"),
                    sinal.get("long_pct"),
                    sinal.get("oi_change_pct"),
                    1 if sinal.get("operar") else 0,
                    json.dumps(sinal, ensure_ascii=False),
                ))
                return cur.lastrowid
    except Exception as e:
        print(f"[MySQL] Erro ao salvar sinal: {e}")
        return None


async def salvar_scan(payload: dict) -> None:
    """Persiste resultado do scan completo."""
    try:
        pool = await get_pool()
        geral = payload.get("geral", [])
        async with pool.acquire() as conn:
            async with conn.cursor() as cur:
                await cur.execute("""
                    INSERT INTO ft_scan_history
                      (payload, total_coins, top_long, top_short, fear_greed, btc_dom)
                    VALUES (%s,%s,%s,%s,%s,%s)
                """, (
                    json.dumps(payload, ensure_ascii=False),
                    len(geral),
                    json.dumps(payload.get("top_long", []), ensure_ascii=False),
                    json.dumps(payload.get("top_short", []), ensure_ascii=False),
                    payload.get("fear_greed"),
                    payload.get("btc_dom"),
                ))
                # Salvar cada sinal operável individualmente
                for s in geral:
                    if s.get("operar") and s.get("direction") != "NEUTRO":
                        await salvar_sinal(s)
    except Exception as e:
        print(f"[MySQL] Erro ao salvar scan: {e}")


async def purge_scan_history(days_to_keep: int = 7) -> int:
    """Remove registros antigos de ft_scan_history. Mantém `days_to_keep` dias."""
    try:
        pool = await get_pool()
        async with pool.acquire() as conn:
            async with conn.cursor() as cur:
                await cur.execute(
                    "DELETE FROM ft_scan_history WHERE criado_em < NOW() - INTERVAL %s DAY",
                    (days_to_keep,),
                )
                deleted = cur.rowcount
                print(f"[MySQL] purge ft_scan_history: {deleted} linhas removidas (>{days_to_keep}d)")
                return deleted
    except Exception as e:
        print(f"[MySQL] Erro no purge scan_history: {e}")
        return 0


async def ultimo_scan() -> Optional[dict]:
    """Retorna o scan mais recente salvo (máx 15 min)."""
    try:
        pool = await get_pool()
        async with pool.acquire() as conn:
            async with conn.cursor(aiomysql.DictCursor) as cur:
                await cur.execute("""
                    SELECT payload, criado_em FROM ft_scan_history
                    WHERE criado_em >= NOW() - INTERVAL 15 MINUTE
                    ORDER BY criado_em DESC LIMIT 1
                """)
                row = await cur.fetchone()
                if row:
                    return json.loads(row["payload"])
    except Exception as e:
        print(f"[MySQL] Erro ao buscar scan: {e}")
    return None


# ── Sim Wallets ───────────────────────────────────────────────────────────────

async def wallet_load_all(tipo: str = "futures") -> dict[str, dict]:
    """Carrega todas as carteiras de um tipo do MySQL."""
    try:
        pool = await get_pool()
        async with pool.acquire() as conn:
            async with conn.cursor(aiomysql.DictCursor) as cur:
                await cur.execute(
                    "SELECT perfil_id, saldo_inicial, saldo_livre, positions FROM sim_wallets WHERE wallet_tipo=%s",
                    (tipo,)
                )
                rows = await cur.fetchall()
                result = {}
                for r in rows:
                    result[r["perfil_id"]] = {
                        "saldo_inicial": r["saldo_inicial"],
                        "saldo_livre":   r["saldo_livre"],
                        "positions":     json.loads(r["positions"] or "{}"),
                    }
                return result
    except Exception as e:
        print(f"[MySQL] wallet_load_all erro: {e}")
        return {}


async def wallet_upsert(perfil_id: str, tipo: str, saldo_inicial: float, saldo_livre: float, positions: dict) -> None:
    """Cria ou atualiza uma carteira no MySQL."""
    try:
        pool = await get_pool()
        async with pool.acquire() as conn:
            async with conn.cursor() as cur:
                await cur.execute("""
                    INSERT INTO sim_wallets (perfil_id, wallet_tipo, saldo_inicial, saldo_livre, positions)
                    VALUES (%s,%s,%s,%s,%s)
                    ON DUPLICATE KEY UPDATE
                      saldo_livre=%s, positions=%s, atualizado=NOW()
                """, (
                    perfil_id, tipo, saldo_inicial, saldo_livre,
                    json.dumps(positions, ensure_ascii=False),
                    saldo_livre,
                    json.dumps(positions, ensure_ascii=False),
                ))
    except Exception as e:
        print(f"[MySQL] wallet_upsert erro: {e}")


async def wallet_reset(perfil_id: str, tipo: str, saldo_inicial: float) -> None:
    """Zera uma carteira (saldo volta ao inicial, positions vazio)."""
    await wallet_upsert(perfil_id, tipo, saldo_inicial, saldo_inicial, {})


async def trade_insert(trade: dict, tipo: str = "futures") -> None:
    """Persiste um trade no MySQL."""
    try:
        pool = await get_pool()
        async with pool.acquire() as conn:
            async with conn.cursor() as cur:
                await cur.execute("""
                    INSERT IGNORE INTO sim_trades
                      (id, perfil_id, wallet_tipo, simbolo, tipo, direction,
                       price_brl, amount_brl, fee, pnl_brl, pct, score,
                       auto_trade, grade, motivo_entrada, motivo_saida, trade_time)
                    VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                """, (
                    trade.get("id"),
                    trade.get("perfil_id"),
                    tipo,
                    trade.get("simbolo"),
                    trade.get("tipo"),
                    trade.get("direction"),
                    trade.get("price_brl"),
                    trade.get("amount_brl"),
                    trade.get("fee", 0),
                    trade.get("pnl_brl"),
                    trade.get("pct"),
                    trade.get("score"),
                    1 if trade.get("auto", True) else 0,
                    trade.get("grade"),
                    trade.get("motivo_entrada"),
                    trade.get("motivo_saida"),
                    trade.get("time", int(time.time() * 1000)),
                ))
    except Exception as e:
        print(f"[MySQL] trade_insert erro: {e}")


async def trades_list(perfil_id: Optional[str] = None, tipo: str = "futures", limit: int = 500) -> list[dict]:
    """Lista trades de uma carteira, mais recentes primeiro."""
    try:
        pool = await get_pool()
        async with pool.acquire() as conn:
            async with conn.cursor(aiomysql.DictCursor) as cur:
                if perfil_id:
                    await cur.execute("""
                        SELECT id, perfil_id, simbolo, tipo, direction, price_brl, amount_brl,
                               fee, pnl_brl, pct, score, auto_trade as auto, grade,
                               motivo_entrada, motivo_saida, trade_time as time
                        FROM sim_trades WHERE perfil_id=%s AND wallet_tipo=%s
                        ORDER BY trade_time DESC LIMIT %s
                    """, (perfil_id, tipo, limit))
                else:
                    await cur.execute("""
                        SELECT id, perfil_id, simbolo, tipo, direction, price_brl, amount_brl,
                               fee, pnl_brl, pct, score, auto_trade as auto, grade,
                               motivo_entrada, motivo_saida, trade_time as time
                        FROM sim_trades WHERE wallet_tipo=%s
                        ORDER BY trade_time DESC LIMIT %s
                    """, (tipo, limit))
                return list(await cur.fetchall())
    except Exception as e:
        print(f"[MySQL] trades_list erro: {e}")
        return []


async def ia_analise_save(perfil_id: str, tipo: str, analise: dict) -> None:
    """Salva ou atualiza resultado de análise IA para um perfil."""
    try:
        pool = await get_pool()
        async with pool.acquire() as conn:
            async with conn.cursor() as cur:
                await cur.execute("""
                    INSERT INTO ia_analises (perfil_id, wallet_tipo, analise)
                    VALUES (%s, %s, %s)
                    ON DUPLICATE KEY UPDATE analise=%s, criado_em=NOW()
                """, (perfil_id, tipo, json.dumps(analise, ensure_ascii=False),
                      json.dumps(analise, ensure_ascii=False)))
    except Exception as e:
        print(f"[MySQL] ia_analise_save erro: {e}")


async def ia_analise_load_all(tipo: str = "futures") -> dict[str, dict]:
    """Carrega todas as análises IA salvas para um tipo."""
    try:
        pool = await get_pool()
        async with pool.acquire() as conn:
            async with conn.cursor(aiomysql.DictCursor) as cur:
                await cur.execute(
                    "SELECT perfil_id, analise, criado_em FROM ia_analises WHERE wallet_tipo=%s",
                    (tipo,)
                )
                rows = await cur.fetchall()
                result = {}
                for r in rows:
                    data = json.loads(r["analise"] or "{}")
                    data["_criado_em"] = r["criado_em"].isoformat() if r["criado_em"] else None
                    result[r["perfil_id"]] = data
                return result
    except Exception as e:
        print(f"[MySQL] ia_analise_load_all erro: {e}")
        return {}


async def overrides_save(perfil_id: str, tipo: str, overrides: dict) -> None:
    """Salva overrides aprovados para um perfil."""
    try:
        pool = await get_pool()
        async with pool.acquire() as conn:
            async with conn.cursor() as cur:
                await cur.execute("""
                    INSERT INTO perfis_overrides (perfil_id, wallet_tipo, overrides)
                    VALUES (%s, %s, %s)
                    ON DUPLICATE KEY UPDATE overrides=%s, aprovado_em=NOW()
                """, (perfil_id, tipo, json.dumps(overrides, ensure_ascii=False),
                      json.dumps(overrides, ensure_ascii=False)))
    except Exception as e:
        print(f"[MySQL] overrides_save erro: {e}")


async def overrides_load_all(tipo: str = "futures") -> dict[str, dict]:
    """Carrega todos os overrides aprovados para um tipo."""
    try:
        pool = await get_pool()
        async with pool.acquire() as conn:
            async with conn.cursor(aiomysql.DictCursor) as cur:
                await cur.execute(
                    "SELECT perfil_id, overrides, aprovado_em FROM perfis_overrides WHERE wallet_tipo=%s",
                    (tipo,)
                )
                rows = await cur.fetchall()
                result = {}
                for r in rows:
                    data = json.loads(r["overrides"] or "{}")
                    data["_aprovado_em"] = r["aprovado_em"].isoformat() if r["aprovado_em"] else None
                    result[r["perfil_id"]] = data
                return result
    except Exception as e:
        print(f"[MySQL] overrides_load_all erro: {e}")
        return {}


async def overrides_delete(perfil_id: str, tipo: str) -> None:
    """Remove override de um perfil."""
    try:
        pool = await get_pool()
        async with pool.acquire() as conn:
            async with conn.cursor() as cur:
                await cur.execute(
                    "DELETE FROM perfis_overrides WHERE perfil_id=%s AND wallet_tipo=%s",
                    (perfil_id, tipo)
                )
    except Exception as e:
        print(f"[MySQL] overrides_delete erro: {e}")


async def historico_sinais(simbolo: Optional[str] = None, limit: int = 50) -> list[dict]:
    """Últimos sinais salvos, opcionalmente filtrado por símbolo."""
    try:
        pool = await get_pool()
        async with pool.acquire() as conn:
            async with conn.cursor(aiomysql.DictCursor) as cur:
                if simbolo:
                    await cur.execute("""
                        SELECT id, simbolo, direction, grade, score_final, dir_conf,
                               preco, leverage_sug, entrada, stop_loss, take_profit,
                               funding_rate, long_pct, oi_change_pct, operar, criado_em
                        FROM ft_sinais WHERE simbolo=%s
                        ORDER BY criado_em DESC LIMIT %s
                    """, (simbolo.upper(), limit))
                else:
                    await cur.execute("""
                        SELECT id, simbolo, direction, grade, score_final, dir_conf,
                               preco, leverage_sug, entrada, stop_loss, take_profit,
                               funding_rate, long_pct, oi_change_pct, operar, criado_em
                        FROM ft_sinais WHERE operar=1
                        ORDER BY criado_em DESC LIMIT %s
                    """, (limit,))
                rows = await cur.fetchall()
                for r in rows:
                    if "criado_em" in r and r["criado_em"]:
                        r["criado_em"] = r["criado_em"].isoformat()
                return list(rows)
    except Exception as e:
        print(f"[MySQL] Erro ao buscar histórico: {e}")
        return []


# ── CEREBRO ───────────────────────────────────────────────────────────────────

async def cerebro_upsert(signal: dict) -> None:
    """Salva ou atualiza um sinal do CEREBRO."""
    try:
        pool = await get_pool()
        async with pool.acquire() as conn:
            async with conn.cursor() as cur:
                await cur.execute("""
                    INSERT INTO cerebro_signals
                      (id, simbolo, direction, source, source_perfil,
                       score_final, score_tecnico, score_fluxo, score_contexto, score_fundamental,
                       price_entrada, tp_pct, sl_pct, confianca, aprovado, motivo, status,
                       pnl_pct, telegram_entry, telegram_exit, registrado_em, fechado_em)
                    VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                    ON DUPLICATE KEY UPDATE
                      status=VALUES(status), pnl_pct=VALUES(pnl_pct),
                      telegram_exit=VALUES(telegram_exit), fechado_em=VALUES(fechado_em)
                """, (
                    signal["id"], signal["simbolo"], signal["direction"],
                    signal["source"], signal.get("source_perfil"),
                    signal.get("score_final"), signal.get("score_tecnico"),
                    signal.get("score_fluxo"), signal.get("score_contexto"),
                    signal.get("score_fundamental"),
                    signal.get("price_entrada"), signal.get("tp_pct"), signal.get("sl_pct"),
                    signal["confianca"], 1 if signal.get("aprovado") else 0,
                    signal.get("motivo"), signal.get("status", "aprovado"),
                    signal.get("pnl_pct"),
                    1 if signal.get("telegram_entry") else 0,
                    1 if signal.get("telegram_exit") else 0,
                    signal.get("registrado_em"), signal.get("fechado_em"),
                ))
    except Exception as e:
        print(f"[MySQL] cerebro_upsert erro: {e}")


async def cerebro_update_outcome(
    signal_id: str,
    status: str,
    pnl_pct: Optional[float],
    fechado_em: str,
    telegram_exit: bool = False,
) -> None:
    """Atualiza apenas o resultado de um sinal existente (status, pnl, fechamento)."""
    try:
        pool = await get_pool()
        async with pool.acquire() as conn:
            async with conn.cursor() as cur:
                await cur.execute("""
                    UPDATE cerebro_signals
                    SET status=%s, pnl_pct=%s, fechado_em=%s, telegram_exit=%s
                    WHERE id=%s
                """, (status, pnl_pct, fechado_em, 1 if telegram_exit else 0, signal_id))
    except Exception as e:
        print(f"[MySQL] cerebro_update_outcome erro: {e}")


async def cerebro_list(limit: int = 500, status: Optional[str] = None) -> list[dict]:
    """Lista sinais do CEREBRO, mais recentes primeiro."""
    try:
        pool = await get_pool()
        async with pool.acquire() as conn:
            async with conn.cursor(aiomysql.DictCursor) as cur:
                if status:
                    await cur.execute("""
                        SELECT * FROM cerebro_signals WHERE status=%s
                        ORDER BY registrado_em DESC LIMIT %s
                    """, (status, limit))
                else:
                    await cur.execute("""
                        SELECT * FROM cerebro_signals
                        ORDER BY registrado_em DESC LIMIT %s
                    """, (limit,))
                rows = list(await cur.fetchall())
                for r in rows:
                    for k in ("registrado_em", "fechado_em"):
                        if r.get(k):
                            r[k] = r[k].isoformat()
                return rows
    except Exception as e:
        print(f"[MySQL] cerebro_list erro: {e}")
        return []
