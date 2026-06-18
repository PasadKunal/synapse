import uuid

import structlog
from celery import Celery
from sqlalchemy import select, update

from api.config import settings

log = structlog.get_logger()

celery_app = Celery(
    "synapse",
    broker=settings.redis_url,
    backend=settings.redis_url.replace("/0", "/1"),  # separate Redis DB for results
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
    # PyTorch/sentence-transformers crash on fork() on macOS (Python 3.14 + OpenMP).
    # solo pool runs tasks in the main process without forking.
    worker_pool="solo",
)



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


def _save_span(task_id: str, agent_name: str, tokens_used: int):
    from api.models import AgentSpan

    session = _get_sync_session()
    try:
        session.add(AgentSpan(
            task_id=uuid.UUID(task_id),
            agent_name=agent_name,
            tokens_used=tokens_used,
        ))
        session.commit()
    except Exception:
        session.rollback()
    finally:
        session.close()



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
    import time as _time; _task_start = _time.perf_counter()
    log.info("task_started", task_id=task_id, user_id=user_id)
    _update_task_status(task_id, "running")

    try:
        import asyncio as _asyncio
        import redis as sync_redis, json as _json
        _redis_sync = sync_redis.from_url(settings.redis_url, decode_responses=True)

        # Check semantic cache and retrieve relevant memories before running agents
        cached_answer = None
        memory_context: list[str] = []
        try:
            async def _preflight():
                from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
                from memory.episodic_store import check_semantic_cache, retrieve_relevant
                engine = create_async_engine(settings.database_url)
                async with AsyncSession(engine) as s:
                    hit = await check_semantic_cache(s, user_id, user_input)
                    memories = [] if hit else await retrieve_relevant(s, user_id, user_input, k=2)
                await engine.dispose()
                return hit, memories
            cached_answer, memory_context = _asyncio.run(_preflight())
        except Exception as pre_exc:
            log.warning("preflight_failed", task_id=task_id, error=str(pre_exc))

        if cached_answer:
            log.info("returning_cached_answer", task_id=task_id)
            _redis_sync.publish(f"spans:{task_id}", _json.dumps({"agent_name": "FINISH", "tokens_used": 0, "latency_ms": 0}))
            _update_task_status(task_id, "done", result={"answer": cached_answer}, token_cost=0)
            return {"answer": cached_answer, "tokens_used": 0}

        if memory_context:
            log.info("memory_context_loaded", task_id=task_id, chunks=len(memory_context))

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
            memory_context=memory_context,
        )

        # thread_id ties this run to its LangGraph checkpoint
        config = {"configurable": {"thread_id": task_id}}

        result_state = None
        for chunk in agent_graph.stream(initial_state, config=config):
            for node_name, node_output in chunk.items():
                if not isinstance(node_output, dict):
                    continue
                tokens = node_output.get("tokens_used", 0)
                span = {
                    "agent_name": node_name,
                    "tokens_used": tokens,
                    "latency_ms": 0,
                }
                _redis_sync.publish(f"spans:{task_id}", _json.dumps(span))
                _save_span(task_id, node_name, tokens)
            result_state = chunk  # last chunk has final merged state

        # After streaming, get the full final state via invoke for the merged result
        result_state = agent_graph.get_state(config).values

        supervisor_answer = result_state.get("final_answer") or ""
        token_cost = result_state.get("tokens_used", 0)

        # Prefer specialist output (contains actual code/research with proper markdown).
        # The supervisor's prose summary becomes a footer if it parsed cleanly.
        specialist_content = None
        for msg in reversed(result_state.get("messages", [])):
            content = msg.get("content", "")
            for prefix in ("Coder result:\n", "Researcher result:\n", "Analyst result:\n", "Writer result:\n"):
                if content.startswith(prefix):
                    specialist_content = content[len(prefix):].strip()
                    break
            if specialist_content:
                break

        if specialist_content:
            bad_answer = not supervisor_answer or "encountered an error" in supervisor_answer
            if bad_answer:
                final_answer = specialist_content
            else:
                final_answer = f"{specialist_content}\n\n---\n\n{supervisor_answer}"
        else:
            final_answer = supervisor_answer or "No answer produced."

        # Publish FINISH sentinel so WebSocket client knows it's done
        _redis_sync.publish(f"spans:{task_id}", _json.dumps({"agent_name": "FINISH", "tokens_used": 0, "latency_ms": 0}))

        _update_task_status(
            task_id,
            status="done",
            result={"answer": final_answer},
            token_cost=token_cost,
        )

        # Store episodic memory summary + semantic cache entry for future tasks
        try:
            from memory.summarizer import summarize_conversation
            from memory.episodic_store import store_episode, store_cache_entry

            summary = summarize_conversation(result_state.get("messages", []))

            async def _store_memories():
                from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
                engine = create_async_engine(settings.database_url)
                async with AsyncSession(engine) as s:
                    if summary:
                        await store_episode(s, user_id, summary, task_id)
                    await store_cache_entry(s, user_id, user_input, final_answer, task_id)
                await engine.dispose()
            _asyncio.run(_store_memories())
        except Exception as mem_exc:
            log.warning("memory_store_failed", task_id=task_id, error=str(mem_exc))

        # Record metrics and check for anomalies
        try:
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
        raise self.retry(exc=exc, countdown=30 * (2 ** self.request.retries))
