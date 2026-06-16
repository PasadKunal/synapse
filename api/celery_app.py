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
        result_state = agent_graph.invoke(initial_state, config=config)

        final_answer = result_state.get("final_answer") or "No answer produced."
        token_cost = result_state.get("tokens_used", 0)

        _update_task_status(
            task_id,
            status="done",
            result={"answer": final_answer},
            token_cost=token_cost,
        )
        log.info("task_done", task_id=task_id, tokens=token_cost)
        return {"answer": final_answer, "tokens_used": token_cost}

    except Exception as exc:
        log.error("task_failed", task_id=task_id, error=str(exc))
        _update_task_status(task_id, "failed", result={"error": str(exc)})
        # Retry with exponential backoff — delay doubles each retry
        raise self.retry(exc=exc, countdown=30 * (2 ** self.request.retries))
