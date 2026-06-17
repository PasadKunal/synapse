# ⚡ Synapse

**Autonomous multi-agent orchestration and observability platform — built entirely on free-tier services.**

Synapse decomposes natural-language tasks into subtasks, routes them to specialist AI agents, streams execution traces to a real-time dashboard, and stores episodic memory for context-aware future runs.

---

## Demo

![Synapse UI](https://raw.githubusercontent.com/PasadKunal/synapse/main/docs/demo.png)

- Submit any task (research, code, analysis, writing)
- Watch the **Live Trace** show each agent as it runs
- Expand completed tasks to read syntax-highlighted answers
- Give 👍 / 👎 feedback to generate DPO training pairs

---

## Architecture

```
Browser
  │  (HTTP / WebSocket)
  ▼
FastAPI ──► Celery Worker ──► LangGraph Graph
  │              │                  │
  │         Redis pub/sub      Supervisor
  │         (span stream)    ┌──────┴──────┐
  │              │        Researcher    Coder
  │              │        Analyst      Writer
  ▼              ▼
WebSocket   Redis (hot memory, TTL 1h)
  │         pgvector (episodic memory, 384-dim)
  ▼
TraceViewer (real-time spans + token bar chart)
```

### Agent Topology

| Agent | Model | Role |
|---|---|---|
| **Supervisor** | llama-3.3-70b-versatile | Decomposes tasks, routes to specialists, synthesizes final answer |
| **Researcher** | llama-3.1-8b-instant | DuckDuckGo web search + synthesis |
| **Coder** | llama-3.1-8b-instant | Code generation + sandboxed subprocess execution |
| **Analyst** | llama-3.1-8b-instant | Data reasoning and structured analysis |
| **Writer** | llama-3.1-8b-instant | Long-form content and explanation |

The Supervisor runs first, picks a specialist, then runs again after the specialist finishes — continuing until the task is complete or the token budget / loop limit is hit.

---

## Tech Stack

| Layer | Technology | Why |
|---|---|---|
| Agent framework | LangGraph 1.2.5 (StateGraph) | Typed nodes, conditional edges, MemorySaver checkpointing |
| LLMs | Groq (free tier) | Zero cost, no credit card required |
| Web search | DuckDuckGo (`ddgs`) | Free, no API key |
| Code execution | `subprocess` (10s timeout) | Safe sandboxing, no cloud dependency |
| Task queue | Celery 5 + Redis | Async execution, retries with exponential backoff |
| Hot memory | Redis (TTL 1h) | Fast key-value context per task |
| Episodic memory | pgvector on PostgreSQL | 384-dim MMR retrieval across sessions |
| Embeddings | sentence-transformers all-MiniLM-L6-v2 | Local model, completely free |
| Semantic cache | Cosine similarity > 0.92 | Skip re-running near-duplicate queries |
| Anomaly detection | Welford online algorithm | O(1) memory z-score on tokens + latency |
| API | FastAPI + WebSockets | Async, JWT auth, token-bucket rate limiter |
| Observability | OpenTelemetry (console/OTLP) | Span tracing across agent hops |
| Frontend | React + TypeScript + Vite + Tailwind | |
| Charts | Recharts | Token-per-agent bar chart |
| Markdown | react-markdown + react-syntax-highlighter | Syntax-highlighted code blocks |

---

## Quickstart

### Prerequisites

- Python 3.12+
- Docker Desktop (for Postgres + Redis)
- Node.js 18+
- A free [Groq API key](https://console.groq.com)

### 1. Clone and set up Python environment

```bash
git clone https://github.com/PasadKunal/synapse.git
cd synapse
python3 -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
```

### 2. Configure environment

```bash
cp .env.example .env
# Edit .env and set:
#   GROQ_API_KEY=your_key_here
#   SECRET_KEY=$(python3 -c "import secrets; print(secrets.token_hex(32))")
```

### 3. Start Postgres + Redis

```bash
docker compose -f infra/docker-compose.yml up postgres redis -d
```

### 4. Run database migrations

```bash
alembic upgrade head
```

### 5. Start all three processes (three terminals)

```bash
# Terminal 1 — API
uvicorn api.main:app --reload

# Terminal 2 — Celery worker
celery -A api.celery_app worker --loglevel=info --queues=agent_tasks

# Terminal 3 — Frontend
cd frontend && npm install && npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

### Dev login

On the login screen, click **Dev Login** to generate a local JWT token — no Google OAuth setup required for development.

---

## Project Structure

```
synapse/
├── agents/
│   ├── state.py          # AgentState TypedDict
│   ├── base.py           # Groq client, model constants
│   ├── supervisor.py     # Task decomposition + routing
│   ├── researcher.py     # DuckDuckGo web search
│   ├── coder.py          # Code generation + subprocess exec
│   ├── analyst.py        # Structured analysis
│   ├── writer.py         # Long-form content
│   └── graph.py          # LangGraph StateGraph assembly
├── memory/
│   ├── embeddings.py     # sentence-transformers (local, 384-dim)
│   ├── episodic_store.py # pgvector MMR retrieval + semantic cache
│   └── summarizer.py     # Groq-based conversation compaction
├── api/
│   ├── main.py           # FastAPI app + lifespan
│   ├── celery_app.py     # Celery task + span streaming
│   ├── models.py         # SQLAlchemy models (6 tables)
│   ├── auth.py           # JWT + Google OAuth
│   ├── rate_limiter.py   # Token-bucket (Redis-backed)
│   ├── websocket_handler.py  # /ws/{task_id} span relay
│   └── routes/           # /tasks, /feedback, /auth
├── observability/
│   └── anomaly_detector.py  # Welford z-score detector
├── frontend/
│   └── src/
│       ├── components/
│       │   ├── TaskDashboard.tsx  # Task input + history
│       │   └── TraceViewer.tsx    # Live WebSocket span stream
│       └── api/client.ts          # Typed API + WebSocket client
├── infra/
│   ├── docker-compose.yml  # postgres + redis + api + worker + flower
│   ├── Dockerfile
│   └── ci.yml              # GitHub Actions (ruff + mypy + pytest)
└── alembic/                # Async migrations (pgvector enabled)
```

---

## How It Works

### Task Execution Flow

1. User submits a task via the frontend
2. FastAPI creates a `Task` record (status: `pending`) and enqueues a Celery job
3. The Celery worker runs `agent_graph.stream()` — publishing a Redis pub/sub span after each node completes
4. The FastAPI WebSocket handler (`/ws/{task_id}`) subscribes to that channel and forwards spans to the browser in real time
5. The TraceViewer component renders each span as it arrives
6. After the graph finishes, the worker writes the final answer to Postgres (status: `done`)
7. The frontend's 2-second poll picks up the completed task and renders the answer

### Memory System

- **Semantic cache**: Before running the agent graph, the input is embedded and compared against recent queries (cosine > 0.92 → return cached answer instantly)
- **Hot memory**: Redis stores the working context (messages, tool results) for the duration of the task
- **Episodic memory**: After each task, a Groq-generated summary is embedded and stored in pgvector; retrieved via MMR for future tasks by the same user

### Anomaly Detection

The `WelfordDetector` class tracks a running mean and variance of token cost and latency using the Welford online algorithm (O(1) memory). Any value with z-score > 3.0 triggers a structured log warning.

---

## Key Design Decisions

| Decision | Alternative | Why |
|---|---|---|
| Groq free tier | Anthropic/OpenAI | Zero cost during development |
| subprocess code execution | E2B cloud sandbox | No API key, no cost, sufficient for demos |
| sentence-transformers local model | OpenAI embeddings API | Free, runs offline |
| DuckDuckGo ddgs | SerpAPI / Bing | No API key required |
| Celery `worker_pool=solo` | prefork (default) | PyTorch/OpenMP crash on `fork()` (macOS + Python 3.14) |
| `operator.add` on AgentState fields | Manual merge | Safe concurrent appending for `messages` and `tokens_used` |

---

## API Reference

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/auth/dev-token` | Generate dev JWT (no OAuth) |
| `POST` | `/tasks/` | Create and enqueue a task |
| `GET` | `/tasks/` | List last 50 tasks |
| `GET` | `/tasks/{id}` | Get task status + result |
| `POST` | `/feedback/tasks/{id}/feedback` | Submit 👍/👎 (saves DPO pair) |
| `WS` | `/ws/{task_id}` | Real-time span stream |
| `GET` | `/health` | Health check |
