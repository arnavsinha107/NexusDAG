# NexusDAG — Visual Multi-Agent Workflow & Vector Engine

NexusDAG is a production-grade directed acyclic graph (DAG) execution engine and visual workflow studio for multi-agent AI systems. It connects dense vector retrieval over PostgreSQL (`pgvector`), semantic condition routing, and LLM inference into an interactive canvas with topological scheduling and real-time streaming telemetry.

---

## 1. System Architecture

```
                               ┌────────────────────────────────┐
                               │   Next.js 14 Web Studio        │
                               │   (React Flow + Zustand)       │
                               └───────────┬──────▲─────────────┘
                                           │      │  WebSockets
                                HTTP REST  │      │  (Tokens & Logs)
                                           ▼      │
                               ┌──────────────────┴─────────────┐
                               │     FastAPI Core Engine        │
                               │  (Asyncio + Topological Sort)  │
                               └───────┬──────────────┬─────────┘
                                       │              │
                       Sentence Embeddings            │ SQL & HNSW Search
                                       ▼              ▼
                               ┌───────────────┐ ┌──────────────────────┐
                               │ PyTorch MiniLM│ │ PostgreSQL (pgvector)│
                               │ Transformer   │ │ HNSW Vector Index    │
                               └───────────────┘ └──────────────────────┘
```

### Core Subsystems:
1. **Visual Studio Canvas (`frontend/`)**: Built on Next.js 14 App Router, `@xyflow/react`, and a high-contrast editorial design system. Enables node parameter configuration, real-time edge flow animation, live SSE token accumulation, and vector store querying.
2. **Asynchronous DAG Engine (`backend/app/engine/`)**: Implements Kahn's topological sort algorithm to schedule independent nodes with maximal concurrency. Supports dynamic branch pruning for conditional routers and fail-fast task cancellation.
3. **Dense Vector Store (`backend/app/services/vector_store.py`)**: Persistent chunk embeddings stored in PostgreSQL with `pgvector` utilizing an HNSW index (`m=16`, `ef_construction=64`) under cosine distance.
4. **Real-time Event Broker (`backend/app/engine/broker.py`)**: In-process fan-out pub/sub broker providing gap-free event replay for reconnecting or late-subscribing WebSocket clients.

---

## 2. Supported Node Types

| Node Type | Tag | Responsibility | Configuration Parameters |
| :--- | :--- | :--- | :--- |
| **Input Node** | `IN` | Ingests execution payload parameters | `key` (parameter identifier) |
| **Retriever Node** | `VEC` | Queries PostgreSQL `pgvector` HNSW index | `collection_id`, `top_k`, `min_score`, `query_template` |
| **Router Node** | `RT` | Semantic similarity centroid classifier | `threshold`, `input_template`, `routes` (keys & utterances) |
| **Agent Node** | `LLM` | Generates streaming completions | `system_prompt`, `prompt_template`, `model`, `temperature`, `max_tokens` |
| **Transformer Node** | `TF` | Formats or extracts structured JSON | `operation` (template, truncate, extract_json), `template`, `json_key` |
| **Output Node** | `OUT` | Collects finalized execution artifacts | `key`, `template` |

---

## 3. Algorithmic Highlights

### Kahn's Algorithm with Dynamic Branch Pruning
The execution engine maintains incoming edge dependencies. When a node completes:
- **Router Nodes** evaluate the input against prototype utterance centroids using cosine similarity. If the maximum similarity exceeds `threshold`, the winning route handle is marked active; otherwise the edge to `fallback` is activated.
- Inactive branch edges are dropped, and all downstream nodes dependent strictly on unactivated edges are automatically flagged as `skipped` without spinning up unnecessary LLM or database cycles.

### Vector Ingestion & Chunker
The chunker (`backend/app/services/chunking.py`) operates with markdown heading awareness:
- Headings (`#`, `##`, etc.) enforce hard boundaries preventing semantic cross-contamination between unrelated document sections.
- Sliding token overlaps (default 120 characters) maintain boundary continuity across adjacent chunks.

---

## 4. Getting Started

### Prerequisites
- Python 3.11+ with `uv`
- Node.js 20+ with `npm`
- PostgreSQL 14+ with `pgvector` extension

### Quickstart (Local Development)

#### 1. Start PostgreSQL
Ensure PostgreSQL is running and initialize the database:
```bash
createdb nexusdag
psql -d nexusdag -c "CREATE EXTENSION IF NOT EXISTS vector;"
```

#### 2. Run Backend
```bash
cd backend
uv venv .venv
uv pip install -e ".[dev]"
./.venv/bin/uvicorn main:app --reload --port 8000
```
*The database automatically creates tables and seeds a production sample RAG workflow and knowledge base collection on initial startup.*

#### 3. Run Frontend Studio
```bash
cd frontend
npm install
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 5. Running with Docker Compose

To launch the complete production environment in one command:
```bash
docker compose up --build
```
- Frontend: `http://localhost:3000`
- Backend API: `http://localhost:8000`
- PostgreSQL: `localhost:5432`

---

## 6. Running Tests

Execute the backend test suite:
```bash
cd backend
./.venv/bin/pytest -v
```

Execute frontend type-checking and production build:
```bash
cd frontend
npm run build
```

---

## 7. API Reference

### REST Endpoints
- `GET /api/workflows` — List configured DAG workflows
- `POST /api/workflows` — Create new DAG workflow
- `GET /api/workflows/{id}` — Retrieve workflow graph
- `PUT /api/workflows/{id}` — Update workflow graph and nodes
- `POST /api/workflows/{id}/validate` — Verify graph cycles and connectivity
- `POST /api/workflows/{id}/runs` — Dispatch asynchronous DAG run
- `GET /api/runs` — List historical execution runs with pagination
- `GET /api/runs/{id}` — Detailed node execution audit and outputs
- `POST /api/runs/{id}/cancel` — Cancel in-flight execution
- `GET /api/collections` — List vector store collections
- `POST /api/collections/{id}/upload` — Upload and index documents (PDF, Markdown, TXT)
- `POST /api/collections/{id}/query` — Direct pgvector similarity test sandbox
- `GET /api/stats` — 24-hour telemetry metrics and execution statistics

### WebSocket Streaming Channels
- `ws://localhost:8000/api/runs/ws/{run_id}` — Live bidirectional event channel with full event replay and real-time token streaming.
- `ws://localhost:8000/ws/dag/execute` — Direct visual execution channel.

---

## 8. License
MIT License.
