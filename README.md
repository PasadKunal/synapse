# Synapse

Autonomous multi-agent orchestration and observability platform.

## Architecture

```
User → FastAPI → Celery → LangGraph (Supervisor + Specialists) → Tools
                                  ↕
                    Redis (hot memory) + pgvector (episodic)
                                  ↕
                    OTel + Langfuse (traces, cost, latency)
```

## Agent Topology

- **Supervisor** — decomposes tasks, routes to specialists (Claude Opus 4.8 + adaptive thinking)
- **Researcher** — web search and synthesis (Claude Sonnet 4.6)
- **Coder** — code generation + sandboxed execution via E2B (Claude Sonnet 4.6)
- **Analyst** — data analysis and reasoning (Claude Sonnet 4.6)
- **Writer** — long-form content generation (Claude Sonnet 4.6)
- **SQL Agent** — database query generation and execution (Claude Haiku 4.5)

## Tech Stack

| Layer | Technology |
|---|---|
| Agent framework | LangGraph 0.2 |
| LLMs | Anthropic Claude, OpenAI, Groq |
| Task queue | Celery 5 + Redis |
| Hot memory | Redis (TTL-evicted) |
| Episodic memory | pgvector on PostgreSQL (MMR retrieval) |
| Observability | OpenTelemetry + Langfuse |
| Anomaly detection | Welford online algorithm |
| Code sandbox | E2B |
| API | FastAPI + WebSockets |
| Frontend | React + TypeScript + Recharts |
| Eval | GAIA benchmark |

## Quickstart

```bash
# 1. Clone and enter the repo
git clone https://github.com/PasadKunal/synapse.git
cd synapse

# 2. Create virtual environment
python3 -m venv .venv
source .venv/bin/activate

# 3. Install dependencies
pip install -e ".[dev]"

# 4. Copy env file and fill in API keys
cp .env.example .env

# 5. Start local services
docker compose up -d

# 6. Run migrations
alembic upgrade head

# 7. Start the API
uvicorn api.main:app --reload
```

## Project Structure

```
synapse/
├── agents/          # Supervisor + specialist agents (LangGraph nodes)
├── memory/          # Redis working memory + pgvector episodic store
├── tools/           # Web search, code exec (E2B), SQL, file I/O
├── orchestration/   # Budget enforcer, loop detector, dedup cache, checkpointing
├── api/             # FastAPI routes, WebSocket hub, auth, rate limiter
├── observability/   # OTel config, Langfuse integration, Welford anomaly detector
├── eval/            # GAIA harness, injection test suite, score tracker
├── infra/           # Docker Compose, CI/CD, Locust load tests
└── alembic/         # Database migrations
```

## Roadmap

- [x] Phase 1 — Project scaffold
- [ ] Phase 2 — Core agents (LangGraph)
- [ ] Phase 3 — Two-tier memory system
- [ ] Phase 4 — Fault tolerance (Celery, DLQ, checkpointing)
- [ ] Phase 5 — Observability + React frontend
- [ ] Phase 6 — GAIA benchmark + DPO pipeline
