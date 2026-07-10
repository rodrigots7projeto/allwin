"""
ETL BCB — Séries temporais do Banco Central do Brasil.

API: https://api.bcb.gov.br/dados/serie/bcdata.sgs.{codigo}/dados?formato=json

Séries principais:
  11    → Selic (diária, % a.a.)
  12    → CDI (diária, % a.a.)
  1     → Câmbio USD compra (diária)
  10813 → Câmbio USD venda (diária)
  433   → IPCA (mensal, % no período)
  189   → IGP-M (mensal, %)
  4189  → PIB real (trimestral, variação %)
  13522 → IPCA expectativa Focus (mensal)
  4392  → Selic expectativa Focus (mensal)

Modo incremental: busca apenas dados novos usando o checkpoint da última data.
"""
import logging
from datetime import date, datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert

from ...db import get_db
from ...db.models import SerieMacro, SerieMacroValor, EtlCheckpoint
from ..base import EtlBase

logger = logging.getLogger(__name__)

BCB_URL = "https://api.bcb.gov.br/dados/serie/bcdata.sgs.{codigo}/dados"

# Todas as séries que mantemos atualizadas
SERIES_ALVO = [
    "11", "12", "1", "10813", "433", "189", "4189", "13522", "4392",
]


class BcbSeriesEtl(EtlBase):
    """ETL incremental para séries BCB (SGS)."""
    fonte = "BCB"
    tipo  = "SERIES_MACRO"

    def __init__(self, codigos: list[str] | None = None) -> None:
        super().__init__()
        self.codigos = codigos or SERIES_ALVO

    async def _extrair(self, **_) -> dict[str, list[dict]]:
        """Baixa as séries do BCB, usando checkpoint para busca incremental."""
        async with get_db() as db:
            checkpoints = await _carregar_checkpoints(db, self.codigos)

        dados: dict[str, list[dict]] = {}
        for codigo in self.codigos:
            ultima = checkpoints.get(codigo)
            params: dict = {"formato": "json"}
            if ultima:
                params["dataInicial"] = ultima.strftime("%d/%m/%Y")

            url = BCB_URL.format(codigo=codigo)
            try:
                resp = await self._get(url, params=params, timeout=60)
                dados[codigo] = resp.json()
                logger.info("[BCB] série %s: %d pontos recebidos", codigo, len(dados[codigo]))
            except Exception as e:
                logger.warning("[BCB] série %s falhou: %s", codigo, e)
                dados[codigo] = []

        return dados

    async def _transformar(self, dados: dict[str, list[dict]]) -> dict[str, list[dict]]:
        """Converte datas e valores para os tipos corretos."""
        resultado: dict[str, list[dict]] = {}
        for codigo, pontos in dados.items():
            limpos = []
            for p in pontos:
                try:
                    dt = datetime.strptime(p["data"], "%d/%m/%Y").date()
                    vl = float(str(p["valor"]).replace(",", "."))
                    limpos.append({"data": dt, "valor": vl})
                except (ValueError, KeyError):
                    pass
            resultado[codigo] = limpos
        return resultado

    async def _carregar(self, dados: dict[str, list[dict]]) -> None:
        async with get_db() as db:
            # Mapeia codigo → serie_id
            result = await db.execute(
                select(SerieMacro.id, SerieMacro.codigo).where(SerieMacro.fonte == "BCB")
            )
            serie_map: dict[str, int] = {row.codigo: row.id for row in result}

            for codigo, pontos in dados.items():
                if not pontos:
                    continue
                serie_id = serie_map.get(codigo)
                if not serie_id:
                    logger.warning("[BCB] série %s não encontrada no banco", codigo)
                    continue

                linhas = [
                    {"serie_id": serie_id, "data": p["data"], "valor": p["valor"]}
                    for p in pontos
                ]
                if linhas:
                    await db.execute(
                        pg_insert(SerieMacroValor)
                        .values(linhas)
                        .on_conflict_do_nothing(constraint="serie_macro_valor_unique")
                    )
                    self._inseridos += len(linhas)

                    # Atualiza checkpoint
                    ultima = max(p["data"] for p in pontos)
                    await db.execute(
                        pg_insert(EtlCheckpoint)
                        .values(fonte="BCB", tipo=f"SERIE_{codigo}", ultimo_valor=str(ultima))
                        .on_conflict_do_update(
                            constraint="etl_checkpoint_unique",
                            set_={"ultimo_valor": str(ultima), "atualizado_em": datetime.utcnow()},
                        )
                    )


async def _carregar_checkpoints(db, codigos: list[str]) -> dict[str, date]:
    """Retorna a última data processada de cada série."""
    tipos = [f"SERIE_{c}" for c in codigos]
    result = await db.execute(
        select(EtlCheckpoint.tipo, EtlCheckpoint.ultimo_valor)
        .where(EtlCheckpoint.fonte == "BCB", EtlCheckpoint.tipo.in_(tipos))
    )
    mapa: dict[str, date] = {}
    for row in result:
        codigo = row.tipo.replace("SERIE_", "")
        try:
            mapa[codigo] = date.fromisoformat(row.ultimo_valor)
        except (ValueError, TypeError):
            pass
    return mapa
