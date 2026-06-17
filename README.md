# Synapse

Autonomous multi-agent platform built entirely on free-tier services.

Synapse breaks down natural-language tasks into subtasks, routes them to specialist AI agents, streams execution traces to a live dashboard, and stores episodic memory so future runs have context.

---

## Demo

![Synapse UI](https://raw.githubusercontent.com/PasadKunal/synapse/main/docs/demo.png)

- Submit any task (research, code, analysis, writing)
- Watch the **Live Trace** show each agent step as it runs
- Expand completed tasks to read syntax-highlighted answers
- Give thumbs up or down feedback to save DPO training pairs

---

## Architecture

```
Browser
  |  (HTTP / WebSocket)
  v
FastAPI --> Celery Worker --> LangGraph Graph
  |              |                  |
  |         Redis pub/sub      Supervisor
  |         (span stream)    .----------.
  |              |        Researcher  Coder
  |              |        Analyst    Writer
  v              v
WebSocket   Redis (working memory, TTL 1h)
  |         pgvector (episodic memory, 384-dim)
  v
TraceViewer (real-time spans + token bar chart)
```

### Agent Topology

| Agent | Model | Role |
|---|---|---|
| **Supervisor** | llama-3.3-70b-versatile | Breaks down tasks, routes to specialists, writes the final answer |
| **Researcher** | llama-3.1-8b-instant | DuckDuckGo web search + synthesis |
| **Coder** | llama-3.1-8b-instant | Code generation + sandboxed subprocess execution |
| **Analyst** | llama-3.1-8b-instant | Data reasoning and structured analysis |
| **Writer** | llama-3.1-8b-instant | Long-form content and explanation |

The Supervisor runs first, picks a specialist, then runs again after the specialist finishes. This loop continues until the task is fully answered or the loop limit is reached.

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
- Docker Desktop (for Postgres and Redis)
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

### 3. Start Postgres and Redis

```bash
docker compose -f infra/docker-compose.yml up postgres redis -d
```

### 4. Run database migrations

```bash
alembic upgrade head
```

### 5. Start all three processes

Open three terminal tabs:

```bash
# Terminal 1: API
uvicorn api.main:app --reload

# Terminal 2: Celery worker
celery -A api.celery_app worker --loglevel=info --queues=agent_tasks

# Terminal 3: Frontend
cd frontend && npm install && npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

### Demo login

Click **Continue with Demo** on the login screen to get started immediately without signing up.

---

## Project Structure

```
synapse/
├── agents/
│   ├── state.py          # AgentState TypedDict
│   ├── base.py           # Groq client, model constants
│   ├── supervisor.py     # Task decomposition and routing
│   ├── researcher.py     # DuckDuckGo web search
│   ├── coder.py          # Code generation and subprocess execution
│   ├── analyst.py        # Structured analysis
│   ├── writer.py         # Long-form content
│   └── graph.py          # LangGraph StateGraph assembly
├── memory/
│   ├── embeddings.py     # sentence-transformers (local, 384-dim)
│   ├── episodic_store.py # pgvector MMR retrieval and semantic cache
│   └── summarizer.py     # Groq-based conversation compaction
├── api/
│   ├── main.py           # FastAPI app and lifespan
│   ├── celery_app.py     # Celery task and span streaming
│   ├── models.py         # SQLAlchemy models (5 tables)
│   ├── auth.py           # JWT and Google OAuth
│   ├── rate_limiter.py   # Token-bucket (Redis-backed)
│   ├── websocket_handler.py  # /ws/{task_id} span relay
│   └── routes/           # /tasks, /feedback, /auth
├── observability/
│   └── anomaly_detector.py  # Welford z-score detector
├── frontend/
│   └── src/
│       ├── components/
│       │   ├── TaskDashboard.tsx  # Task input and history sidebar
│       │   └── TraceViewer.tsx    # Live WebSocket span stream
│       └── api/client.ts          # Typed API and WebSocket client
├── infra/
│   ├── docker-compose.yml  # postgres, redis, api, worker, flower
│   ├── Dockerfile
│   └── ci.yml              # GitHub Actions (ruff, mypy, pytest)
└── alembic/                # Async migrations (pgvector enabled)
```

---

## How It Works

### Task Execution Flow

1. User submits a task via the frontend
2. FastAPI creates a `Task` record (status: `pending`) and enqueues a Celery job
3. The Celery worker runs `agent_graph.stream()`, publishing a Redis pub/sub span after each node completes
4. The FastAPI WebSocket handler (`/ws/{task_id}`) subscribes to that channel and forwards spans to the browser
5. The TraceViewer component renders each span as it arrives
6. After the graph finishes, the worker writes the final answer to Postgres (status: `done`)
7. The frontend polls every 2 seconds and renders the completed answer

### Memory System

- **Semantic cache**: Input is embedded and compared against recent queries. Cosine similarity above 0.92 returns the cached answer instantly without running agents.
- **Hot memory**: Redis stores the working context (messages, tool results) for the duration of each task, with a 1-hour TTL.
- **Episodic memory**: After each task, a Groq-generated summary is embedded and stored in pgvector. Future tasks by the same user retrieve relevant memories via MMR.

### Anomaly Detection

The `WelfordDetector` class tracks a running mean and variance of token cost and latency using the Welford online algorithm (O(1) memory). Any value more than 3 standard deviations from the mean is flagged and triggers a structured log warning.

---

## Key Design Decisions

| Decision | Alternative | Why |
|---|---|---|
| Groq free tier | Anthropic/OpenAI | Zero cost during development |
| subprocess code execution | E2B cloud sandbox | No API key, no cost, sufficient for demos |
| sentence-transformers local model | OpenAI embeddings API | Free, runs offline |
| DuckDuckGo ddgs | SerpAPI / Bing | No API key required |
| Celery `worker_pool=solo` | prefork (default) | PyTorch/OpenMP crash on fork() on macOS + Python 3.14 |
| `operator.add` on AgentState fields | Manual merge | Safe concurrent appending for messages and tokens_used |

---

## API Reference

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/auth/register` | Create a new account |
| `POST` | `/auth/login` | Log in with email and password |
| `POST` | `/auth/demo` | One-click demo login, no signup needed |
| `POST` | `/tasks/` | Create and enqueue a task |
| `GET` | `/tasks/` | List last 50 tasks |
| `GET` | `/tasks/{id}` | Get task status and result |
| `POST` | `/feedback/tasks/{id}/feedback` | Submit thumbs up or down (saves DPO pair) |
| `WS` | `/ws/{task_id}` | Real-time span stream |
| `GET` | `/health` | Health check |
