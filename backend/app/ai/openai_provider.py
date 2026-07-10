"""Provider OpenAI — gpt-4o-mini por padrão."""
from __future__ import annotations

from typing import AsyncIterator

from openai import AsyncOpenAI

from .provider import LLMProvider


class OpenAIProvider(LLMProvider):
    def __init__(self, api_key: str, model: str = "gpt-4o-mini") -> None:
        self._client = AsyncOpenAI(api_key=api_key)
        self._model = model

    @property
    def disponivel(self) -> bool:
        return True

    async def stream_chat(
        self,
        system: str,
        messages: list[dict[str, str]],
        max_tokens: int = 800,
        temperature: float = 0.2,
    ) -> AsyncIterator[str]:
        """Faz streaming de tokens da OpenAI."""
        openai_msgs = [{"role": "system", "content": system}]
        for m in messages:
            papel = m.get("papel", "user")
            role = "assistant" if papel == "assistente" else "user"
            openai_msgs.append({"role": role, "content": m.get("conteudo", "")})

        stream = await self._client.chat.completions.create(
            model=self._model,
            messages=openai_msgs,
            stream=True,
            max_tokens=max_tokens,
            temperature=temperature,
        )

        async for chunk in stream:
            delta = chunk.choices[0].delta.content if chunk.choices else None
            if delta:
                yield delta

    async def chat_json(
        self,
        system: str,
        user_message: str,
        max_tokens: int = 1500,
        temperature: float = 0.1,
    ) -> str:
        """Chamada não-streaming com response_format=json_object. Retorna string JSON."""
        resp = await self._client.chat.completions.create(
            model=self._model,
            messages=[
                {"role": "system", "content": system},
                {"role": "user",   "content": user_message},
            ],
            response_format={"type": "json_object"},
            max_tokens=max_tokens,
            temperature=temperature,
        )
        return resp.choices[0].message.content or "{}"
