"""Rate limiter in-memory por IP — evita abuso do endpoint de chat."""
from __future__ import annotations

import time
from collections import defaultdict


class RateLimiter:
    """
    Janela deslizante simples: N requisições por janela_segundos por chave.
    Thread-safe para asyncio single-process.
    """

    def __init__(self, max_requests: int = 15, janela_segundos: int = 60) -> None:
        self._max = max_requests
        self._janela = janela_segundos
        self._contadores: dict[str, list[float]] = defaultdict(list)

    def verificar(self, chave: str) -> bool:
        """
        Retorna True se a requisição é permitida, False se excedeu o limite.
        Registra a requisição ao mesmo tempo.
        """
        agora = time.monotonic()
        janela_inicio = agora - self._janela
        timestamps = self._contadores[chave]

        # Remove timestamps fora da janela
        self._contadores[chave] = [t for t in timestamps if t > janela_inicio]

        if len(self._contadores[chave]) >= self._max:
            return False

        self._contadores[chave].append(agora)
        return True

    def tempo_restante(self, chave: str) -> int:
        """Segundos até a próxima requisição ser permitida (0 se não há fila)."""
        agora = time.monotonic()
        timestamps = self._contadores.get(chave, [])
        if not timestamps or len(timestamps) < self._max:
            return 0
        mais_antigo = min(timestamps)
        restante = int((mais_antigo + self._janela) - agora)
        return max(0, restante)


# Singleton — compartilhado entre requests
_limiter = RateLimiter(max_requests=15, janela_segundos=60)


def get_limiter() -> RateLimiter:
    return _limiter
