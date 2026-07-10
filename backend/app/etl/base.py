"""
Classe base para todos os conectores ETL do AllWin.

Cada conector herda de EtlBase e implementa:
  • _extrair()   — download / leitura da fonte
  • _transformar() — parse, limpeza, normalização
  • _carregar()  — upsert no PostgreSQL

O método run() orquestra as 3 fases e registra o resultado em etl_run.
"""
import logging
from abc import ABC, abstractmethod
from datetime import datetime, timezone
from typing import Any, Optional

import httpx

logger = logging.getLogger(__name__)


class EtlBase(ABC):
    """Contrato e orquestração de qualquer pipeline ETL."""

    fonte: str = "DESCONHECIDA"
    tipo: str  = "DESCONHECIDO"

    def __init__(self) -> None:
        self._inseridos  = 0
        self._atualizados = 0
        self._ignorados  = 0
        self._erro: Optional[str] = None

    # ── Interface que os filhos devem implementar ─────────────────────────────

    @abstractmethod
    async def _extrair(self, **kwargs) -> Any:
        """Baixa / lê os dados da fonte. Retorna dados brutos."""
        ...

    @abstractmethod
    async def _transformar(self, dados_brutos: Any) -> Any:
        """Limpa, normaliza e valida os dados brutos."""
        ...

    @abstractmethod
    async def _carregar(self, dados: Any) -> None:
        """Persiste os dados no PostgreSQL."""
        ...

    # ── Orquestrador público ──────────────────────────────────────────────────

    async def run(self, **kwargs) -> dict:
        """
        Executa o pipeline ETL completo (Extract → Transform → Load).
        Retorna um resumo com contadores e status.
        """
        inicio = datetime.now(timezone.utc)
        logger.info("[ETL] %s/%s — iniciando", self.fonte, self.tipo)

        try:
            brutos    = await self._extrair(**kwargs)
            dados     = await self._transformar(brutos)
            await self._carregar(dados)
            status    = "CONCLUIDO"
        except Exception as exc:
            self._erro = str(exc)
            status = "ERRO"
            logger.error("[ETL] %s/%s — ERRO: %s", self.fonte, self.tipo, exc)

        duracao = (datetime.now(timezone.utc) - inicio).total_seconds()
        resumo = {
            "fonte":        self.fonte,
            "tipo":         self.tipo,
            "status":       status,
            "inseridos":    self._inseridos,
            "atualizados":  self._atualizados,
            "ignorados":    self._ignorados,
            "duracao_seg":  duracao,
            "erro":         self._erro,
        }
        logger.info("[ETL] %s/%s — %s (%ds | +%d ~%d -%d)",
                    self.fonte, self.tipo, status, int(duracao),
                    self._inseridos, self._atualizados, self._ignorados)
        return resumo

    # ── Helpers HTTP ──────────────────────────────────────────────────────────

    @staticmethod
    async def _get(url: str, timeout: float = 60.0, **kwargs) -> httpx.Response:
        """GET assíncrono com retry simples (3 tentativas)."""
        for tentativa in range(3):
            try:
                async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as c:
                    resp = await c.get(url, **kwargs)
                    resp.raise_for_status()
                    return resp
            except (httpx.TimeoutException, httpx.HTTPStatusError) as e:
                if tentativa == 2:
                    raise
                logger.warning("[ETL] retry %d/3 para %s — %s", tentativa + 1, url, e)
        raise RuntimeError("Máximo de tentativas atingido")
