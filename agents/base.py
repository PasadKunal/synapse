import json
import time

import structlog
from groq import Groq

from api.config import settings

log = structlog.get_logger()

# One shared Groq client
groq_client = Groq(api_key=settings.groq_api_key)

# Model constants, swap these to upgrade
SUPERVISOR_MODEL = "llama-3.3-70b-versatile"   # strongest free model for routing decisions
SPECIALIST_MODEL = "llama-3.1-8b-instant"       # fast and free for specialist work


def call_groq(
    messages: list[dict],
    model: str = SPECIALIST_MODEL,
    temperature: float = 0.2,
    max_tokens: int = 2048,
    tools: list[dict] | None = None,
) -> tuple[str, int]:
    """
    Thin wrapper around Groq chat completions.
    Returns (response_text, total_tokens_used).
    """
    kwargs: dict = {
        "model": model,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
    }
    if tools:
        kwargs["tools"] = tools
        kwargs["tool_choice"] = "auto"

    start = time.perf_counter()
    response = groq_client.chat.completions.create(**kwargs)
    latency_ms = int((time.perf_counter() - start) * 1000)

    content = response.choices[0].message.content or ""
    tokens = response.usage.total_tokens if response.usage else 0

    log.debug("groq_call", model=model, tokens=tokens, latency_ms=latency_ms)
    return content, tokens


def parse_subtask(msg: str) -> str:
    """Extract the subtask text from the supervisor's JSON routing decision.

    The supervisor sends {"next": "agent", "subtask": "..."}.
    Specialists should work on the subtask text, not the raw JSON.
    Falls back to the original string if it isn't valid JSON.
    """
    try:
        parsed = json.loads(msg)
        return parsed.get("subtask", msg)
    except (json.JSONDecodeError, AttributeError, TypeError):
        return msg


_MAX_CHUNK_CHARS = 200  # keep memory snippets short to stay within free-tier TPM limits

def build_context_block(memory_context: list[str]) -> str:
    """Format episodic memories into a system prompt block."""
    if not memory_context:
        return ""
    snippets = [c[:_MAX_CHUNK_CHARS] + ("…" if len(c) > _MAX_CHUNK_CHARS else "") for c in memory_context]
    chunks = "\n---\n".join(snippets)
    return f"\n\n## Relevant past context\n{chunks}\n"
