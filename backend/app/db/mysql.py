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
