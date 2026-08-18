import uuid
from datetime import datetime
from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Field

IDENTIFIER = r"^[A-Za-z_][A-Za-z0-9_]{0,63}$"
NODE_ID = r"^[A-Za-z0-9_-]{1,64}$"
FALLBACK_ROUTE = "fallback"

RunStatus = Literal["queued", "running", "succeeded", "failed", "cancelled"]
NodeStatus = Literal["pending", "running", "succeeded", "failed", "skipped"]

DEFAULT_SYSTEM_PROMPT = (
    "You are a precise assistant. Answer strictly from the supplied context. "
    "If the context is insufficient, say so plainly."
)
DEFAULT_PROMPT_TEMPLATE = "Context:\n{{upstream}}\n\nQuestion: {{inputs.query}}"


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Position(Strict):
    x: float
    y: float


class InputConfig(Strict):
    key: str = Field("query", pattern=IDENTIFIER)


class RetrieverConfig(Strict):
    collection_id: uuid.UUID | None = None
    top_k: int = Field(4, ge=1, le=50)
    min_score: float = Field(0.0, ge=-1.0, le=1.0)
    query_template: str = Field("{{upstream}}", max_length=4000)


class Route(Strict):
    key: str = Field(pattern=IDENTIFIER)
    utterances: list[Annotated[str, Field(min_length=1, max_length=500)]] = Field(
        min_length=1, max_length=50
    )


class RouterConfig(Strict):
    routes: list[Route] = Field(min_length=1, max_length=12)
    threshold: float = Field(0.35, ge=-1.0, le=1.0)
    input_template: str = Field("{{upstream}}", max_length=4000)


class AgentConfig(Strict):
    system_prompt: str = Field(DEFAULT_SYSTEM_PROMPT, max_length=8000)
    prompt_template: str = Field(DEFAULT_PROMPT_TEMPLATE, max_length=16000)
    model: str | None = Field(None, max_length=120)
    temperature: float = Field(0.2, ge=0.0, le=2.0)
    max_tokens: int = Field(512, ge=1, le=8192)


class TransformerConfig(Strict):
    operation: Literal["template", "truncate", "extract_json"] = "template"
    template: str = Field("{{upstream}}", max_length=16000)
    max_chars: int = Field(2000, ge=1, le=200_000)
    json_key: str = Field("", max_length=200)


class OutputConfig(Strict):
    key: str = Field("result", pattern=IDENTIFIER)
    template: str = Field("{{upstream}}", max_length=16000)


class _NodeBase(Strict):
    id: str = Field(pattern=NODE_ID)
    label: str = Field("", max_length=80)
    position: Position = Field(default_factory=lambda: Position(x=0, y=0))

    @property
    def display_name(self) -> str:
        return self.label or self.id


class InputNode(_NodeBase):
    type: Literal["input"]
    config: InputConfig = Field(default_factory=InputConfig)


class RetrieverNode(_NodeBase):
    type: Literal["vector_retriever"]
    config: RetrieverConfig = Field(default_factory=RetrieverConfig)


class RouterNode(_NodeBase):
    type: Literal["semantic_router"]
    config: RouterConfig


class AgentNode(_NodeBase):
    type: Literal["agent"]
    config: AgentConfig = Field(default_factory=AgentConfig)


class TransformerNode(_NodeBase):
    type: Literal["transformer"]
    config: TransformerConfig = Field(default_factory=TransformerConfig)


class OutputNode(_NodeBase):
    type: Literal["output"]
    config: OutputConfig = Field(default_factory=OutputConfig)


GraphNode = Annotated[
    InputNode | RetrieverNode | RouterNode | AgentNode | TransformerNode | OutputNode,
    Field(discriminator="type"),
]


class GraphEdge(Strict):
    id: str = Field(min_length=1, max_length=200)
    source: str
    target: str
    source_handle: str | None = None


class Graph(Strict):
    nodes: list[GraphNode] = Field(default_factory=list, max_length=200)
    edges: list[GraphEdge] = Field(default_factory=list, max_length=1000)


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class GraphIssueRead(BaseModel):
    message: str
    node_id: str | None = None
    edge_id: str | None = None


class ValidationReport(BaseModel):
    valid: bool
    issues: list[GraphIssueRead]


class WorkflowCreate(Strict):
    name: str = Field(min_length=1, max_length=120)
    description: str = Field("", max_length=2000)
    graph: Graph = Field(default_factory=Graph)


class WorkflowUpdate(Strict):
    name: str | None = Field(None, min_length=1, max_length=120)
    description: str | None = Field(None, max_length=2000)
    graph: Graph | None = None


class WorkflowRead(ORMModel):
    id: uuid.UUID
    name: str
    description: str
    graph: Graph
    created_at: datetime
    updated_at: datetime


class WorkflowSummary(BaseModel):
    id: uuid.UUID
    name: str
    description: str
    node_count: int
    created_at: datetime
    updated_at: datetime
    last_run_status: RunStatus | None
    last_run_at: datetime | None


class RunCreate(Strict):
    inputs: dict[str, Annotated[str, Field(max_length=20_000)]] = Field(default_factory=dict)


class NodeRunRead(ORMModel):
    node_id: str
    node_type: str
    status: NodeStatus
    started_at: datetime | None
    finished_at: datetime | None
    output_text: str
    output_data: dict[str, Any]
    error: str | None
    logs: list[str]


class RunSummary(BaseModel):
    id: uuid.UUID
    workflow_id: uuid.UUID
    workflow_name: str
    status: RunStatus
    error: str | None
    created_at: datetime
    started_at: datetime | None
    finished_at: datetime | None
    duration_ms: int | None


class RunRead(RunSummary):
    inputs: dict[str, Any]
    outputs: dict[str, Any]
    graph: Graph
    node_runs: list[NodeRunRead]


class RunPage(BaseModel):
    items: list[RunSummary]
    total: int


class CollectionCreate(Strict):
    name: str = Field(min_length=1, max_length=120)
    description: str = Field("", max_length=2000)


class CollectionRead(BaseModel):
    id: uuid.UUID
    name: str
    description: str
    created_at: datetime
    document_count: int
    chunk_count: int


class DocumentCreate(Strict):
    title: str = Field(min_length=1, max_length=255)
    text: str = Field(min_length=1, max_length=2_000_000)


class DocumentRead(ORMModel):
    id: uuid.UUID
    collection_id: uuid.UUID
    title: str
    source: str
    char_count: int
    chunk_count: int
    created_at: datetime


class QueryRequest(Strict):
    query: str = Field(min_length=1, max_length=2000)
    top_k: int = Field(5, ge=1, le=50)


class QueryMatch(BaseModel):
    chunk_id: int
    document_id: uuid.UUID
    document_title: str
    content: str
    score: float


class DailyRuns(BaseModel):
    date: str
    succeeded: int
    failed: int


class StatsRead(BaseModel):
    runs_24h: int
    success_rate_24h: float | None
    median_duration_ms_24h: int | None
    active_runs: int
    workflows: int
    collections: int
    chunks: int
    daily: list[DailyRuns]


class MetaRead(BaseModel):
    version: str
    environment: str
    llm_provider: str
    llm_model: str
    embedding_provider: str
    embedding_model: str
    embedding_dim: int
