import logging
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.models import Collection, Workflow
from app.services.container import Services
from app.services.ingestion import ingest_document

logger = logging.getLogger(__name__)

SAMPLE_DOC = """# NexusDAG Architecture Specification

## Vector Retrieval Engine
NexusDAG leverages PostgreSQL with the pgvector extension for dense vector storage and nearest-neighbor search. Chunks are generated using sentence-aware boundary splits with sliding token overlaps, indexed with an HNSW graph (m=16, ef_construction=64) under cosine distance metric.

## Directed Acyclic Graph (DAG) Execution Model
The execution engine implements Kahn's topological sort algorithm running on an asynchronous event loop. Nodes with zero in-degree are dispatched concurrently. State transitions (PENDING -> RUNNING -> SUCCESS / FAILED / SKIPPED) are streamed over WebSocket channels.

## Semantic Router Condition Boundaries
Condition routers evaluate semantic similarity against prototype utterance embeddings. Rather than regex or brittle rule engines, router nodes compute cosine centroids across candidate classes and prune dormant execution branches dynamically.

## LLM Agent Inference & Context Injection
Agent executor nodes interpolate context from upstream retriever nodes using strict Jinja-style variable binding ({{upstream}} and {{inputs.query}}). Streaming SSE tokens are piped through WebSocket channels to provide sub-second time-to-first-token in the visual dashboard.
"""

DEFAULT_WORKFLOW_GRAPH = {
    "nodes": [
        {
            "id": "node_input",
            "type": "input",
            "label": "User Query Input",
            "position": {"x": 50, "y": 200},
            "config": {"key": "query"},
        },
        {
            "id": "node_retriever",
            "type": "vector_retriever",
            "label": "Dense pgvector Search",
            "position": {"x": 350, "y": 200},
            "config": {
                "collection_id": None,  # Will be updated to default collection ID on seed
                "top_k": 3,
                "min_score": 0.15,
                "query_template": "{{upstream}}",
            },
        },
        {
            "id": "node_router",
            "type": "semantic_router",
            "label": "Intent & Depth Router",
            "position": {"x": 680, "y": 200},
            "config": {
                "threshold": 0.25,
                "input_template": "{{inputs.query}}",
                "routes": [
                    {
                        "key": "deep_dive",
                        "utterances": [
                            "explain the underlying architecture",
                            "deep dive into technical details",
                            "how does topological sort work under the hood",
                            "detailed algorithmic breakdown",
                        ],
                    },
                    {
                        "key": "quick_summary",
                        "utterances": [
                            "quick tl;dr summary",
                            "give me a brief overview in 2 bullets",
                            "short description",
                            "summarize quickly",
                        ],
                    },
                ],
            },
        },
        {
            "id": "node_deep_agent",
            "type": "agent",
            "label": "Technical Deep Dive Agent",
            "position": {"x": 1050, "y": 100},
            "config": {
                "system_prompt": "You are a senior systems engineer. Provide a rigorous, in-depth architectural breakdown based on the retrieved context.",
                "prompt_template": "Context:\n{{nodes.node_retriever.text}}\n\nQuestion: {{inputs.query}}",
                "model": "gpt-4o-mini",
                "temperature": 0.2,
                "max_tokens": 600,
            },
        },
        {
            "id": "node_summary_agent",
            "type": "agent",
            "label": "Executive Briefing Agent",
            "position": {"x": 1050, "y": 320},
            "config": {
                "system_prompt": "You are an executive assistant. Provide a concise 2-sentence summary strictly based on the context.",
                "prompt_template": "Context:\n{{nodes.node_retriever.text}}\n\nQuestion: {{inputs.query}}",
                "model": "gpt-4o-mini",
                "temperature": 0.1,
                "max_tokens": 250,
            },
        },
        {
            "id": "node_output",
            "type": "output",
            "label": "Final Streamed Response",
            "position": {"x": 1400, "y": 200},
            "config": {
                "key": "result",
                "template": "{{upstream}}",
            },
        },
    ],
    "edges": [
        {"id": "e_in_ret", "source": "node_input", "target": "node_retriever", "source_handle": None},
        {"id": "e_ret_rout", "source": "node_retriever", "target": "node_router", "source_handle": None},
        {"id": "e_rout_deep", "source": "node_router", "target": "node_deep_agent", "source_handle": "deep_dive"},
        {"id": "e_rout_summ", "source": "node_router", "target": "node_summary_agent", "source_handle": "quick_summary"},
        {"id": "e_rout_fallback", "source": "node_router", "target": "node_summary_agent", "source_handle": "fallback"},
        {"id": "e_deep_out", "source": "node_deep_agent", "target": "node_output", "source_handle": None},
        {"id": "e_summ_out", "source": "node_summary_agent", "target": "node_output", "source_handle": None},
    ],
}


async def seed_database(session: AsyncSession, services: Services) -> None:
    settings = get_settings()

    # 1. Check or create default collection
    col_stmt = select(Collection).where(Collection.name == "Nexus Core Architecture")
    collection = (await session.execute(col_stmt)).scalar_one_or_none()

    if collection is None:
        logger.info("Seeding default knowledge base collection...")
        collection = Collection(
            name="Nexus Core Architecture",
            description="System blueprints, vector indexing parameters, and topological sorting engine specs.",
        )
        session.add(collection)
        await session.flush()

        await ingest_document(
            session=session,
            services=services,
            settings=settings,
            collection_id=collection.id,
            title="NexusDAG Core Architecture Spec.md",
            text=SAMPLE_DOC,
            source="seed",
        )
        logger.info("Seeded default documents and vector chunks.")

    # 2. Check or create default workflow
    wf_stmt = select(Workflow).where(Workflow.name == "Enterprise RAG & Intent Router")
    existing_wf = (await session.execute(wf_stmt)).scalar_one_or_none()

    if existing_wf is None:
        logger.info("Seeding default RAG workflow...")
        graph_data = dict(DEFAULT_WORKFLOW_GRAPH)
        # Link the retriever node to the newly created collection ID
        for n in graph_data["nodes"]:
            if n["id"] == "node_retriever":
                n["config"]["collection_id"] = str(collection.id)

        workflow = Workflow(
            name="Enterprise RAG & Intent Router",
            description="Multi-agent DAG with pgvector retrieval, semantic classification, and dynamic branch pruning.",
            graph=graph_data,
        )
        session.add(workflow)
        await session.commit()
        logger.info("Seeded default workflow.")
