import uuid

import structlog
from celery import Celery
from sqlalchemy import select, update

from api.config import settings

log = structlog.get_logger()

# ── Celery app ────────────────────────────────────────────────────────────────
# Broker: Redis (receives tasks)
# Backend: Redis (stores task results so we can poll them)
celery_app = Celery(
    "synapse",
    broker=settings.redis_url,
    backend=settings.redis_url.replace("/0", "/1"),  # separate DB for results
)

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    task_acks_late=True,            # only ack after the task finishes, not on receipt
    task_reject_on_worker_lost=True,  # re-queue if the worker dies mid-task
    task_track_started=True,
    worker_prefetch_multiplier=1,   # one task per worker at a time (agent tasks are heavy)
    task_routes={"api.celery_app.run_agent_task": {"queue": "agent_tasks"}},
)


# ── DB helpers (sync, used inside Celery worker) ──────────────────────────────

def _get_sync_session():
    """Synchronous DB session for use inside Celery tasks (not async)."""
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker

    sync_url = settings.database_url.replace("+asyncpg", "+psycopg2")
    engine = create_engine(sync_url)
    Session = sessionmaker(bind=engine)
    return Session()


def _update_task_status(task_id: str, status: str, result: dict | None = None, token_cost: int = 0):
    from api.models import Task

    session = _get_sync_session()
    try:
        session.execute(
            update(Task)
            .where(Task.id == uuid.UUID(task_id))
            .values(status=status, result=result, token_cost=token_cost)
        )
        session.commit()
    finally:
        session.close()


# ── Main agent task ───────────────────────────────────────────────────────────

@celery_app.task(
    name="api.celery_app.run_agent_task",
    bind=True,
    max_retries=3,
    default_retry_delay=30,    # 30s between retries
    queue="agent_tasks",
)
def run_agent_task(self, task_id: str, user_input: str, user_id: str):
    """
    Execute the LangGraph agent graph for a user task.

    - Runs in a Celery worker process (separate from the FastAPI process)
    - Updates task status in Postgres at start, end, and on failure
    - Retries up to 3 times with 30s delay if an unexpected error occurs
    - Task ID is deterministic so duplicate submissions don't double-run
    """
    import time as _time
    _task_start = _time.perf_counter()
    log.info("task_started", task_id=task_id, user_id=user_id)
    _update_task_status(task_id, "running")

    try:
        from agents.graph import agent_graph
        from agents.state import AgentState

        initial_state = AgentState(
            task_id=task_id,
            user_id=user_id,
            input=user_input,
            messages=[],
            next_agent="",
            final_answer=None,
            token_budget=settings.default_token_budget,
            tokens_used=0,
            loop_count=0,
            memory_context=[],
        )

        # thread_id ties this run to its LangGraph checkpoint
        config = {"configurable": {"thread_id": task_id}}

        # Use stream() instead of invoke() so we can publish each span as it completes
        import redis as sync_redis, json as _json
        _redis_sync = sync_redis.from_url(settings.redis_url, decode_responses=True)

        result_state = None
        for chunk in agent_graph.stream(initial_state, config=config):
            for node_name, node_output in chunk.items():
                if not isinstance(node_output, dict):
                    continue
                span = {
                    "agent_name": node_name,
                    "tokens_used": node_output.get("tokens_used", 0),
                    "latency_ms": 0,
                }
                _redis_sync.publish(f"spans:{task_id}", _json.dumps(span))
            result_state = chunk  # last chunk has final merged state

        # After streaming, get the full final state via invoke for the merged result
        result_state = agent_graph.get_state(config).values

        final_answer = result_state.get("final_answer") or "No answer produced."
        token_cost = result_state.get("tokens_used", 0)

        # Publish FINISH sentinel so WebSocket client knows it's done
        _redis_sync.publish(f"spans:{task_id}", _json.dumps({"agent_name": "FINISH", "tokens_used": 0, "latency_ms": 0}))

        _update_task_status(
            task_id,
            status="done",
            result={"answer": final_answer},
            token_cost=token_cost,
        )

        # Store a summary of this conversation in episodic memory
        # so future tasks by the same user can benefit from it
        try:
            from memory.summarizer import summarize_conversation
            from memory.episodic_store import store_episode
            import asyncio

            summary = summarize_conversation(result_state.get("messages", []))
            if summary:
                session = _get_sync_session()
                # Run async store in a new event loop (Celery workers are sync)
                async def _store():
                    from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
                    engine = create_async_engine(settings.database_url)
                    async with AsyncSession(engine) as s:
                        await store_episode(s, user_id, summary, task_id)
                    await engine.dispose()
                asyncio.run(_store())
        except Exception as mem_exc:
            log.warning("memory_store_failed", task_id=task_id, error=str(mem_exc))

        # Record metrics and check for anomalies
        try:
            import time as _time
            from observability.anomaly_detector import record_task_metrics
            elapsed_ms = int((_time.perf_counter() - _task_start) * 1000)
            record_task_metrics(tokens=token_cost, latency_ms=elapsed_ms, task_id=task_id)
        except Exception as obs_exc:
            log.warning("anomaly_check_failed", error=str(obs_exc))

        log.info("task_done", task_id=task_id, tokens=token_cost)
        return {"answer": final_answer, "tokens_used": token_cost}

    except Exception as exc:
        log.error("task_failed", task_id=task_id, error=str(exc))
        _update_task_status(task_id, "failed", result={"error": str(exc)})
        # Retry with exponential backoff — delay doubles each retry
        raise self.retry(exc=exc, countdown=30 * (2 ** self.request.retries))
