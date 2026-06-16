"""
Langfuse integration — LLM-specific tracing.

Langfuse free tier: 50k events/month, no credit card needed.
Sign up at cloud.langfuse.com, add keys to .env.

Each agent call creates a Langfuse span with:
- Which model was used
- How many tokens were consumed
- Latency
- Input/output (for debugging)

If Langfuse keys are not set, tracing is silently skipped —
the app works fine without it.
"""

import functools
import os
import time
from typing import Callable

import structlog

log = structlog.get_logger()

_langfuse = None


def _get_langfuse():
    """Lazy init — only create client if keys are configured."""
    global _langfuse
    if _langfuse is not None:
        return _langfuse

    public_key = os.getenv("LANGFUSE_PUBLIC_KEY", "")
    secret_key = os.getenv("LANGFUSE_SECRET_KEY", "")

    if not public_key or not secret_key:
        return None

    try:
        from langfuse import Langfuse
        _langfuse = Langfuse(
            public_key=public_key,
            secret_key=secret_key,
            host=os.getenv("LANGFUSE_HOST", "https://cloud.langfuse.com"),
        )
        log.info("langfuse_ready")
    except Exception as exc:
        log.warning("langfuse_init_failed", error=str(exc))
        _langfuse = None

    return _langfuse


def trace_llm_call(
    name: str,
    model: str,
    input_text: str,
    output_text: str,
    tokens: int,
    latency_ms: int,
    user_id: str = "",
    task_id: str = "",
) -> None:
    """
    Record a single LLM call in Langfuse.
    Call this after every Groq API call.
    """
    lf = _get_langfuse()
    if lf is None:
        return

    try:
        trace = lf.trace(
            name=name,
            user_id=user_id,
            session_id=task_id,
            metadata={"model": model, "tokens": tokens, "latency_ms": latency_ms},
        )
        trace.generation(
            name=f"{name}_generation",
            model=model,
            input=input_text[:2000],   # truncate to avoid huge payloads
            output=output_text[:2000],
            usage={"total_tokens": tokens},
        )
    except Exception as exc:
        log.warning("langfuse_trace_failed", error=str(exc))


def traced_agent(agent_name: str) -> Callable:
    """
    Decorator for agent node functions.
    Wraps the call with a Langfuse span + timing.

    Usage:
        @traced_agent("researcher")
        def researcher_node(state): ...
    """
    def decorator(func: Callable) -> Callable:
        @functools.wraps(func)
        def wrapper(state, *args, **kwargs):
            lf = _get_langfuse()
            start = time.perf_counter()

            if lf:
                lf_trace = lf.trace(
                    name=f"agent:{agent_name}",
                    user_id=state.get("user_id", ""),
                    session_id=state.get("task_id", ""),
                    input={"task": state.get("input", "")[:500]},
                )
                span = lf_trace.span(name=agent_name)
            else:
                span = None

            try:
                result = func(state, *args, **kwargs)
                latency_ms = int((time.perf_counter() - start) * 1000)
                if span:
                    span.end(
                        output={"tokens": result.get("tokens_used", 0)},
                        metadata={"latency_ms": latency_ms},
                    )
                log.info(
                    "agent_span",
                    agent=agent_name,
                    task_id=state.get("task_id"),
                    latency_ms=latency_ms,
                    tokens=result.get("tokens_used", 0),
                )
                return result
            except Exception as exc:
                if span:
                    span.end(level="ERROR", status_message=str(exc))
                raise

        return wrapper
    return decorator
