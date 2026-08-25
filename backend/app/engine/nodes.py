import json
import re
from collections.abc import Awaitable, Callable, Mapping
from dataclasses import dataclass, field
from typing import Any

import numpy as np

from app.engine.templating import render_template
from app.schemas import (
    FALLBACK_ROUTE,
    AgentNode,
    GraphNode,
    InputNode,
    OutputNode,
    RetrieverNode,
    RouterNode,
    TransformerNode,
)
from app.services.container import Services
from app.services.embeddings import cosine_similarity
from app.services.llm import CompletionRequest

_CODE_FENCE = re.compile(r"^```[a-zA-Z]*\s*|\s*```$")

EmitFn = Callable[[str, dict[str, Any]], Awaitable[None]]


class NodeError(RuntimeError):
    pass


@dataclass(frozen=True)
class NodeResult:
    text: str
    data: dict[str, Any] = field(default_factory=dict)
    route: str | None = None


@dataclass
class NodeContext:
    node: GraphNode
    inputs: Mapping[str, str]
    upstream: str
    scope: dict[str, Any]
    services: Services
    emit: EmitFn
    logs: list[str] = field(default_factory=list)

    async def log(self, message: str) -> None:
        self.logs.append(message)
        await self.emit("node.log", {"message": message})

    async def token(self, text: str) -> None:
        await self.emit("node.token", {"token": text})

    async def render(self, template: str) -> str:
        text, missing = render_template(template, self.scope)
        if missing:
            await self.log(f"Unresolved template variables: {', '.join(sorted(set(missing)))}")
        return text


async def _run_input(ctx: NodeContext, node: InputNode) -> NodeResult:
    value = ctx.inputs.get(node.config.key, "")
    return NodeResult(text=value, data={"key": node.config.key, "characters": len(value)})


async def _run_retriever(ctx: NodeContext, node: RetrieverNode) -> NodeResult:
    cfg = node.config
    if cfg.collection_id is None:
        raise NodeError("No collection selected.")
    query = (await ctx.render(cfg.query_template)).strip()
    if not query:
        raise NodeError("Retriever received an empty query.")
    vector = (await ctx.services.embed([query]))[0]
    matches = await ctx.services.retriever.search(
        cfg.collection_id, vector.tolist(), cfg.top_k, cfg.min_score
    )
    if matches:
        await ctx.log(f"Retrieved {len(matches)} chunk(s); best score {matches[0].score:.3f}")
    else:
        await ctx.log("No chunks met the similarity threshold.")
    text = "\n\n".join(
        f"[{rank}] {match.document_title}\n{match.content}"
        for rank, match in enumerate(matches, start=1)
    )
    return NodeResult(
        text=text,
        data={
            "query": query,
            "matches": [
                {
                    "chunk_id": match.chunk_id,
                    "document_id": str(match.document_id),
                    "document_title": match.document_title,
                    "score": round(match.score, 4),
                }
                for match in matches
            ],
        },
    )


async def _run_router(ctx: NodeContext, node: RouterNode) -> NodeResult:
    cfg = node.config
    text = (await ctx.render(cfg.input_template)).strip()
    if not text:
        raise NodeError("Router received empty input.")
    utterances = [u for route in cfg.routes for u in route.utterances]
    vectors = await ctx.services.embed([text, *utterances])
    query, offset = vectors[0], 1
    scores: dict[str, float] = {}
    for route in cfg.routes:
        block = vectors[offset : offset + len(route.utterances)]
        offset += len(route.utterances)
        scores[route.key] = cosine_similarity(query, np.mean(block, axis=0))

    best_key, best_score = max(scores.items(), key=lambda item: item[1])
    chosen = best_key if best_score >= cfg.threshold else FALLBACK_ROUTE
    ranked = ", ".join(f"{key} {score:.3f}" for key, score in scores.items())
    await ctx.log(f"Scores: {ranked}. Routed to '{chosen}' (threshold {cfg.threshold:.2f}).")
    return NodeResult(
        text=text,
        data={"route": chosen, "scores": {k: round(v, 4) for k, v in scores.items()}},
        route=chosen,
    )


async def _run_agent(ctx: NodeContext, node: AgentNode) -> NodeResult:
    cfg = node.config
    request = CompletionRequest(
        system=await ctx.render(cfg.system_prompt),
        prompt=await ctx.render(cfg.prompt_template),
        model=cfg.model or ctx.services.default_model,
        temperature=cfg.temperature,
        max_tokens=cfg.max_tokens,
        focus=" ".join(ctx.inputs.values()),
    )
    await ctx.log(f"Calling {ctx.services.llm.name} model '{request.model}'.")
    parts: list[str] = []
    async for token in ctx.services.llm.stream(request):
        parts.append(token)
        await ctx.token(token)
    text = "".join(parts).strip()
    if not text:
        raise NodeError("Model returned an empty completion.")
    return NodeResult(text=text, data={"model": request.model, "characters": len(text)})


def _extract_json(source: str) -> object:
    cleaned = _CODE_FENCE.sub("", source.strip())
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        starts = [i for i in (cleaned.find("{"), cleaned.find("[")) if i >= 0]
        if not starts:
            raise NodeError("Upstream text contains no JSON.") from None
        start = min(starts)
        end = cleaned.rfind("}" if cleaned[start] == "{" else "]")
        try:
            return json.loads(cleaned[start : end + 1])
        except json.JSONDecodeError as exc:
            raise NodeError(f"Could not parse JSON: {exc.msg}.") from exc


async def _run_transformer(ctx: NodeContext, node: TransformerNode) -> NodeResult:
    cfg = node.config
    source = await ctx.render(cfg.template)
    if cfg.operation == "template":
        return NodeResult(text=source)
    if cfg.operation == "truncate":
        if len(source) <= cfg.max_chars:
            return NodeResult(text=source, data={"truncated": False})
        cut = source.rfind(" ", 0, cfg.max_chars)
        text = source[: cut if cut > cfg.max_chars // 2 else cfg.max_chars].rstrip()
        return NodeResult(text=text, data={"truncated": True, "original_length": len(source)})

    value = _extract_json(source)
    for part in filter(None, cfg.json_key.split(".")):
        if isinstance(value, dict) and part in value:
            value = value[part]
        elif isinstance(value, list) and part.isdigit() and int(part) < len(value):
            value = value[int(part)]
        else:
            raise NodeError(f"Key path '{cfg.json_key}' not found in JSON.")
    text = value if isinstance(value, str) else json.dumps(value, ensure_ascii=False)
    return NodeResult(text=text, data={"json_key": cfg.json_key})


async def _run_output(ctx: NodeContext, node: OutputNode) -> NodeResult:
    return NodeResult(text=await ctx.render(node.config.template), data={"key": node.config.key})


async def execute_node(ctx: NodeContext) -> NodeResult:
    match ctx.node:
        case InputNode() as node:
            return await _run_input(ctx, node)
        case RetrieverNode() as node:
            return await _run_retriever(ctx, node)
        case RouterNode() as node:
            return await _run_router(ctx, node)
        case AgentNode() as node:
            return await _run_agent(ctx, node)
        case TransformerNode() as node:
            return await _run_transformer(ctx, node)
        case OutputNode() as node:
            return await _run_output(ctx, node)
