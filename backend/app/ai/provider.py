"""Abstração de provider LLM — troque o modelo sem alterar o endpoint."""
from __future__ import annotations

from abc import ABC, abstractmethod
from typing import AsyncIterator


class LLMProvider(ABC):
    """Interface comum para qualquer provider de LLM."""

    @abstractmethod
    async def stream_chat(
        self,
        system: str,
        messages: list[dict[str, str]],
        max_tokens: int = 800,
        temperature: float = 0.2,
    ) -> AsyncIterator[str]:
        """Gera tokens em streaming. Cada yield é um fragmento de texto."""
        ...

    @abstractmethod
    async def chat_json(
        self,
        system: str,
        user_message: str,
        max_tokens: int = 1500,
        temperature: float = 0.1,
    ) -> str:
        """Chamada não-streaming que retorna JSON como string. Lança exceção em falha."""
        ...

    @property
    @abstractmethod
    def disponivel(self) -> bool:
        """True se o provider está configurado com chave de API."""
        ...


def get_provider() -> LLMProvider | None:
    """Fábrica — retorna o provider configurado ou None se nenhuma chave disponível."""
    from ..config import settings
    from .openai_provider import OpenAIProvider

    if settings.openai_api_key:
        return OpenAIProvider(
            api_key=settings.openai_api_key,
            model=settings.openai_model,
        )

    return None
