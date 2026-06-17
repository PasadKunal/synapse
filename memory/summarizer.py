"""
Summarises conversation histories before storing them in episodic memory.
Keeps the episodic store dense and retrieval precise.
"""

import structlog

from agents.base import SPECIALIST_MODEL, call_groq

log = structlog.get_logger()

SUMMARIZE_PROMPT = """Summarise the following agent conversation into 3-5 bullet points.
Focus on: what was asked, what was found/built, and the key conclusions.
Be concise. This summary will be used as context for future related tasks."""


def summarize_conversation(messages: list[dict]) -> str:
    """
    Condense a list of agent messages into a short summary string.
    Called after a task completes before storing to episodic memory.
    """
    if not messages:
        return ""

    conversation_text = "\n".join(
        f"{m['role'].upper()}: {m['content'][:500]}"  # truncate each message
        for m in messages[-10:]  # only last 10 messages
    )

    summary, _ = call_groq(
        messages=[
            {"role": "system", "content": SUMMARIZE_PROMPT},
            {"role": "user", "content": conversation_text},
        ],
        model=SPECIALIST_MODEL,
        temperature=0.2,
        max_tokens=300,
    )

    log.debug("memory_summarized", original_messages=len(messages), summary_len=len(summary))
    return summary
