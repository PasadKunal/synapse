"""
Langfuse integration — optional LLM tracing.

If LANGFUSE_PUBLIC_KEY and LANGFUSE_SECRET_KEY are set in .env,
every agent call will be traced. If the keys are absent the app
runs normally — tracing is silently skipped.

Free tier: 50k events/month at cloud.langfuse.com.
"""

import os

import structlog

log = structlog.get_logger()

_langfuse = None


def _get_langfuse():
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
