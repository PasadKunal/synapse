import structlog

from agents.base import SPECIALIST_MODEL, build_context_block, call_groq
from agents.state import AgentState

log = structlog.get_logger()

SYSTEM_PROMPT = """You are a data and reasoning specialist. You:
- Perform calculations step-by-step, showing your working.
- Draw logical conclusions from data or previous research results.
- Identify patterns, anomalies, or key insights.
- Are precise — never guess when you can reason it out.

Format your response clearly with sections if needed."""


def analyst_node(state: AgentState) -> dict:
    last_msg = state["messages"][-1]["content"] if state["messages"] else state["input"]
    log.info("analyst", task_id=state["task_id"], subtask=last_msg[:80])

    # Include the full conversation so the analyst has all prior context
    memory_block = build_context_block(state.get("memory_context", []))
    conversation = "\n\n".join(
        f"{m['role'].upper()}: {m['content']}" for m in state.get("messages", [])
    )

    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {
            "role": "user",
            "content": (
                f"Task: {state['input']}\n\n"
                f"Conversation so far:\n{conversation}\n\n"
                f"Sub-task: {last_msg}"
                f"{memory_block}"
            ),
        },
    ]

    response_text, tokens = call_groq(
        messages=messages,
        model=SPECIALIST_MODEL,
        temperature=0.2,
        max_tokens=2048,
    )

    log.info("analyst_done", task_id=state["task_id"], tokens=tokens)
    return {
        "messages": [{"role": "user", "content": f"Analyst result:\n{response_text}"}],
        "tokens_used": tokens,
        "loop_count": state["loop_count"] + 1,
    }
