import structlog
from ddgs import DDGS

from agents.base import SPECIALIST_MODEL, build_context_block, call_groq, parse_subtask
from agents.state import AgentState

log = structlog.get_logger()

_INJECTION_PATTERNS = [
    "ignore previous instructions",
    "ignore all instructions",
    "forget everything above",
    "you are now",
    "your new role is",
    "pretend you are",
    "act as if",
    "new system prompt",
    "disregard all prior",
    "override your instructions",
    "jailbreak",
    "from now on you",
    "###new instructions###",
]


def _check_injection(text: str) -> bool:
    lower = text.lower()
    return any(pattern in lower for pattern in _INJECTION_PATTERNS)


SYSTEM_PROMPT = """You are a research specialist. You have been given search results from the web.
Synthesise them into a clear, factual answer to the sub-task.
- Use markdown: **bold** for key terms, bullet lists for multiple points, headings if needed.
- Cite which result supports each claim (e.g. [1], [2]).
- Do not make up information not found in the results."""


def _web_search(query: str, max_results: int = 5) -> list[dict]:
    """Run a DuckDuckGo text search. Free, no API key needed."""
    try:
        with DDGS() as ddgs:
            return list(ddgs.text(query, max_results=max_results))
    except Exception as exc:
        log.warning("search_failed", query=query, error=str(exc))
        return []


def researcher_node(state: AgentState) -> dict:
    last_msg = state["messages"][-1]["content"] if state["messages"] else state["input"]
    subtask = parse_subtask(last_msg)
    log.info("researcher", task_id=state["task_id"], subtask=subtask[:80])

    results = _web_search(subtask)

    if results:
        clean_parts = []
        for i, r in enumerate(results):
            body = r.get("body", "")
            if _check_injection(body):
                log.warning("injection_detected", source=r.get("href", ""), query=subtask[:60])
                body = "[Content filtered: possible prompt injection detected]"
            clean_parts.append(f"[{i+1}] {r.get('title', '')}\n{body}")
        results_text = "\n\n".join(clean_parts)
    else:
        results_text = "No web results found. Answer from your training knowledge if possible."

    memory_block = build_context_block(state.get("memory_context", []))
    messages = [
        {
            "role": "user",
            "content": (
                f"Sub-task: {subtask}\n\n"
                f"Search results:\n{results_text}"
                f"{memory_block}"
            ),
        }
    ]

    response_text, tokens = call_groq(
        messages=messages,
        model=SPECIALIST_MODEL,
        temperature=0.3,
        max_tokens=1024,
    )

    log.info("researcher_done", task_id=state["task_id"], tokens=tokens)
    return {
        "messages": [{"role": "user", "content": f"Researcher result:\n{response_text}"}],
        "tokens_used": tokens,
        "loop_count": state["loop_count"] + 1,
    }
