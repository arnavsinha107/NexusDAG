import asyncio
import json
import re
from collections.abc import AsyncIterator
from dataclasses import dataclass
from typing import Protocol

import httpx

from app.config import Settings

_SENTENCE = re.compile(r"(?<=[.!?])\s+|\n+")
_TERM = re.compile(r"[a-z0-9]{3,}")


class LLMError(RuntimeError):
    pass


@dataclass(frozen=True)
class CompletionRequest:
    system: str
    prompt: str
    model: str
    temperature: float
    max_tokens: int
    focus: str = ""


class LLMClient(Protocol):
    name: str

    def stream(self, request: CompletionRequest) -> AsyncIterator[str]: ...

    async def aclose(self) -> None: ...


class OpenAICompatibleClient:
    """Streams chat completions from any OpenAI-compatible endpoint (OpenAI, Ollama, vLLM)."""

    name = "openai"

    def __init__(self, base_url: str, api_key: str | None, timeout: float) -> None:
        headers = {"Authorization": f"Bearer {api_key}"} if api_key else {}
        self._client = httpx.AsyncClient(
            base_url=base_url.rstrip("/"),
            headers=headers,
            timeout=httpx.Timeout(timeout, connect=10.0),
        )

    async def stream(self, request: CompletionRequest) -> AsyncIterator[str]:
        payload = {
            "model": request.model,
            "temperature": request.temperature,
            "max_tokens": request.max_tokens,
            "stream": True,
            "messages": [
                {"role": "system", "content": request.system},
                {"role": "user", "content": request.prompt},
            ],
        }
        async with self._client.stream("POST", "/chat/completions", json=payload) as response:
            if response.status_code >= 400:
                body = (await response.aread()).decode(errors="replace")[:400]
                raise LLMError(f"LLM endpoint returned {response.status_code}: {body}")
            async for line in response.aiter_lines():
                if not line.startswith("data:"):
                    continue
                data = line[5:].strip()
                if data == "[DONE]":
                    break
                choices = json.loads(data).get("choices") or []
                if choices:
                    delta = choices[0].get("delta", {}).get("content")
                    if delta:
                        yield delta

    async def aclose(self) -> None:
        await self._client.aclose()


def _terms(text: str) -> set[str]:
    return set(_TERM.findall(text.lower()))


class OfflineClient:
    """Extractive responder used when no LLM endpoint is configured.

    Returns the prompt sentences sharing the most terms with the run's query, keeping
    pipelines runnable end-to-end without network access. It never invents content.
    """

    name = "offline"

    async def stream(self, request: CompletionRequest) -> AsyncIterator[str]:
        focus = request.focus.strip()
        focus_terms = _terms(focus or request.prompt)
        sentences = [
            " ".join(s.split())
            for s in _SENTENCE.split(request.prompt)
            if len(s.strip()) > 24 and (not focus or focus not in s)
        ]
        scored = [(len(focus_terms & _terms(s)), i) for i, s in enumerate(sentences)]
        picked = sorted(i for score, i in sorted(scored, reverse=True)[:3] if score > 0)
        answer = (
            " ".join(sentences[i] for i in picked)
            or "The supplied context does not contain an answer to this question."
        )
        for token in re.findall(r"\S+\s*", answer)[: request.max_tokens]:
            yield token
            await asyncio.sleep(0)

    async def aclose(self) -> None:
        return None


def build_llm(settings: Settings) -> LLMClient:
    if settings.llm_provider == "openai":
        key = settings.llm_api_key.get_secret_value() if settings.llm_api_key else None
        return OpenAICompatibleClient(settings.llm_base_url, key, settings.llm_timeout_seconds)
    return OfflineClient()
