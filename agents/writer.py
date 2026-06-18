import structlog

from agents.base import SPECIALIST_MODEL, build_context_block, call_groq, parse_subtask
from agents.state import AgentState

log = structlog.get_logger()

SYSTEM_PROMPT = """You are a writing specialist. You produce clear, well-structured long-form content.
You:
- Adapt your tone to the request (formal report, blog post, email, creative, etc.)
- Organise content with appropriate headings and structure.
- Draw from all research and analysis already in the conversation.
- Write in complete, polished prose (not bullet points unless explicitly asked).
Do not repeat instructions back. Just write the content."""


def writer_node(state: AgentState) -> dict:
    last_msg = state["messages"][-1]["content"] if state["messages"] else state["input"]
    subtask = parse_subtask(last_msg)
    log.info("writer", task_id=state["task_id"], subtask=subtask[:80])

    memory_block = build_context_block(state.get("memory_context", []))
    conversation = "\n\n".join(
        f"{m['role'].upper()}: {m['content']}" for m in state.get("messages", [])
    )

    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {
            "role": "user",
            "content": (
                f"Original task: {state['input']}\n\n"
                f"Research and analysis so far:\n{conversation}\n\n"
                f"Writing sub-task: {subtask}"
                f"{memory_block}"
            ),
        },
    ]

    response_text, tokens = call_groq(
        messages=messages,
        model=SPECIALIST_MODEL,
        temperature=0.6,  # higher temp for more natural prose
        max_tokens=4096,
    )

    log.info("writer_done", task_id=state["task_id"], tokens=tokens)
    return {
        "messages": [{"role": "user", "content": f"Writer result:\n{response_text}"}],
        "tokens_used": tokens,
        "loop_count": state["loop_count"] + 1,
    }
