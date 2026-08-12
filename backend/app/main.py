import json
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.api.collections import router as collections_router
from app.api.meta import router as meta_router
from app.api.runs import router as runs_router
from app.api.stats import router as stats_router
from app.api.workflows import router as workflows_router
from app.config import get_settings
from app.db import SessionLocal, engine
from app.engine.broker import RunBroker
from app.engine.manager import RunManager
from app.log import configure_logging
from app.models import Base
from app.schemas import Graph, RunCreate
from app.seed import seed_database
from app.services.container import Services
from app.services.embeddings import build_embedder
from app.services.llm import build_llm
from app.services.vector_store import PgVectorRetriever

logger = logging.getLogger("nexusdag")


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    configure_logging(settings.log_level, json_output=settings.is_production)
    logger.info("Starting NexusDAG Engine v1.0.0 [%s]", settings.environment)

    # 1. Initialize schema & extensions
    async with engine.begin() as conn:
        try:
            await conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
        except Exception as e:
            logger.warning("Could not execute CREATE EXTENSION vector: %s", e)
        await conn.run_sync(Base.metadata.create_all)

    # 2. Build runtime services & manager
    embedder = build_embedder(settings)
    llm = build_llm(settings)
    retriever = PgVectorRetriever(SessionLocal)
    services = Services(
        embedder=embedder,
        llm=llm,
        retriever=retriever,
        default_model=settings.llm_model,
    )

    broker = RunBroker()
    manager = RunManager(SessionLocal, services, broker, settings)

    app.state.settings = settings
    app.state.services = services
    app.state.broker = broker
    app.state.run_manager = manager

    # 3. Clean up interrupted runs & seed database
    await manager.recover_interrupted()
    async with SessionLocal() as session:
        try:
            await seed_database(session, services)
        except Exception as e:
            logger.error("Database seed failed: %s", e)

    yield

    # Shutdown
    logger.info("Shutting down NexusDAG Engine...")
    await manager.shutdown()
    await llm.aclose()
    await engine.dispose()


app = FastAPI(
    title="NexusDAG AI Agent Engine",
    version="1.0.0",
    description="High-performance visual multi-agent DAG workflow and vector orchestration engine",
    lifespan=lifespan,
)

settings = get_settings()
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins + ["*"] if not settings.is_production else settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# API Routers
app.include_router(workflows_router, prefix="/api")
app.include_router(runs_router, prefix="/api")
app.include_router(collections_router, prefix="/api")
app.include_router(stats_router, prefix="/api")
app.include_router(meta_router, prefix="/api")


@app.get("/healthz")
async def health_check():
    return {"status": "healthy", "service": "nexusdag-engine"}


# Backwards-compatible WebSocket endpoint specified in context.md
@app.websocket("/ws/dag/execute")
async def legacy_workflow_ws(websocket: WebSocket):
    """Direct visual execution channel compatible with blueprint specification."""
    await websocket.accept()
    manager: RunManager = websocket.app.state.run_manager
    broker: RunBroker = websocket.app.state.broker

    try:
        data = await websocket.receive_text()
        payload = json.loads(data)
        nodes_raw = payload.get("nodes", [])
        edges_raw = payload.get("edges", [])
        inputs_raw = payload.get("inputs", {"query": "Execute system workflow query"})

        # Normalise graph structure if nodes are minimal
        graph_nodes = []
        for n in nodes_raw:
            ntype = n.get("type", "agent").lower()
            if ntype in ("vector_retriever", "retriever"):
                ntype = "vector_retriever"
                cfg = {"collection_id": None, "top_k": 3, "min_score": 0.0, "query_template": "{{upstream}}"}
            elif ntype in ("semantic_router", "router"):
                ntype = "semantic_router"
                cfg = {
                    "threshold": 0.3,
                    "input_template": "{{upstream}}",
                    "routes": [{"key": "default", "utterances": ["query", "task", "run"]}],
                }
            elif ntype in ("agent_executor", "agent"):
                ntype = "agent"
                cfg = {
                    "system_prompt": "You are an AI assistant.",
                    "prompt_template": "{{upstream}}",
                    "model": "gpt-4o-mini",
                    "temperature": 0.2,
                    "max_tokens": 512,
                }
            elif ntype == "input":
                cfg = {"key": "query"}
            elif ntype == "output":
                cfg = {"key": "result", "template": "{{upstream}}"}
            else:
                ntype = "agent"
                cfg = {
                    "system_prompt": "You are an agent node.",
                    "prompt_template": "{{upstream}}",
                    "model": "gpt-4o-mini",
                    "temperature": 0.2,
                    "max_tokens": 512,
                }

            graph_nodes.append({
                "id": n["id"],
                "type": ntype,
                "label": n.get("data", {}).get("label", n.get("label", n["id"])),
                "position": n.get("position", {"x": 0, "y": 0}),
                "config": cfg,
            })

        graph_edges = [
            {
                "id": e.get("id", f"{e['source']}_{e['target']}"),
                "source": e["source"],
                "target": e["target"],
                "source_handle": e.get("source_handle"),
            }
            for e in edges_raw
        ]

        graph = Graph.model_validate({"nodes": graph_nodes, "edges": graph_edges})

        import uuid
        from app.models import Workflow, Run

        async with SessionLocal() as session:
            # Create transient or demo workflow
            wf = Workflow(name="Ad-hoc WebSocket Execution", description="Real-time execution", graph=graph.model_dump(mode="json"))
            session.add(wf)
            await session.commit()

            run = Run(workflow_id=wf.id, status="queued", inputs=inputs_raw, outputs={}, graph=graph.model_dump(mode="json"))
            session.add(run)
            await session.commit()
            run_id = run.id

        manager.start(run_id, wf.id, graph, inputs_raw)

        # Stream events directly back to client
        async with broker.subscribe(run_id) as subscriber:
            if subscriber:
                _, queue = subscriber
                while True:
                    event = await queue.get()
                    if event is None:
                        break
                    # Send in blueprint's expected JSON format
                    if event["type"] == "node.started":
                        await websocket.send_text(json.dumps({
                            "node_id": event["node_id"],
                            "status": "RUNNING",
                            "log": f"Executing AI DAG Node ({event['data'].get('node_type')})...",
                        }))
                    elif event["type"] == "node.log":
                        await websocket.send_text(json.dumps({
                            "node_id": event["node_id"],
                            "status": "RUNNING",
                            "log": event["data"].get("message", ""),
                        }))
                    elif event["type"] == "node.completed":
                        await websocket.send_text(json.dumps({
                            "node_id": event["node_id"],
                            "status": "SUCCESS",
                            "log": f"Node finished with {len(event['data'].get('text', ''))} chars output",
                            "output": event["data"].get("text", ""),
                        }))
                    elif event["type"] == "node.failed":
                        await websocket.send_text(json.dumps({
                            "node_id": event["node_id"],
                            "status": "FAILED",
                            "log": f"Node failed: {event['data'].get('error', '')}",
                        }))
                    elif event["type"] == "run.finished":
                        st = "COMPLETE" if event["data"].get("status") == "succeeded" else "FAILED"
                        await websocket.send_text(json.dumps({
                            "status": st,
                            "log": f"AI DAG Execution {st.capitalize()}",
                            "outputs": event["data"].get("outputs", {}),
                        }))

    except WebSocketDisconnect:
        pass
    except Exception as e:
        await websocket.send_text(json.dumps({"status": "ERROR", "log": str(e)}))
