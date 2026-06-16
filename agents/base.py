import time

import structlog
from groq import Groq

from api.config import settings

log = structlog.get_logger()

# One shared Groq client — free tier, no cost
groq_client = Groq(api_key=settings.groq_api_key)

# Model aliases — swap these when you want to upgrade
SUPERVISOR_MODEL = "llama-3.3-70b-versatile"   # strongest free model for routing decisions
SPECIALIST_MODEL = "llama-3.1-8b-instant"       # fast + free for specialist work


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


def build_context_block(memory_context: list[str]) -> str:
    """Format episodic memories into a system prompt block."""
    if not memory_context:
        return ""
    chunks = "\n---\n".join(memory_context)
    return f"\n\n## Relevant past context\n{chunks}\n"
