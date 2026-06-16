import json
import re

import structlog

from agents.base import SUPERVISOR_MODEL, build_context_block, call_groq
from agents.state import AgentState

log = structlog.get_logger()

SYSTEM_PROMPT = """You are Synapse Supervisor — an orchestration agent that breaks down complex tasks
and delegates them to the right specialist.

Available specialists:
- researcher  : searches the web and synthesises information
- coder       : writes and executes Python code, solves programming problems
- analyst     : reasons over data, does calculations, draws conclusions
- writer      : produces long-form text, reports, summaries, or creative content

Your job:
1. Read the user task and any previous results in the conversation.
2. Decide which specialist to call next (or FINISH if the task is done).
3. Write a precise sub-task instruction for that specialist.

Always respond with valid JSON only — no prose outside the JSON block:

To delegate:
{"next": "<specialist_name>", "subtask": "<clear instruction for the specialist>"}

To finish:
{"next": "FINISH", "answer": "<final consolidated answer to the user>"}
"""


def _parse_decision(text: str) -> dict:
    """Extract JSON from the model response even if wrapped in markdown."""
    # Strip ```json ... ``` fences if present
    text = re.sub(r"```(?:json)?\s*", "", text).strip().rstrip("`").strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        # Last resort: look for the first {...} block
        match = re.search(r"\{.*\}", text, re.DOTALL)
        if match:
            return json.loads(match.group())
        raise ValueError(f"Could not parse supervisor decision: {text[:200]}")


def supervisor_node(state: AgentState) -> dict:
    log.info("supervisor", task_id=state["task_id"], loop=state["loop_count"])

    # System prompt must be first so Groq follows JSON-only instructions
    memory_block = build_context_block(state.get("memory_context", []))
    messages = [{"role": "system", "content": SYSTEM_PROMPT + memory_block}]
    messages.append({"role": "user", "content": state["input"]})
    messages.extend(state.get("messages", []))

    response_text, tokens = call_groq(
        messages=messages,
        model=SUPERVISOR_MODEL,
        temperature=0.1,  # low temp — we want deterministic routing
        max_tokens=512,
    )

    try:
        decision = _parse_decision(response_text)
    except ValueError as exc:
        log.error("supervisor_parse_error", error=str(exc))
        # Fail safe — return what we have so far
        return {
            "next_agent": "FINISH",
            "final_answer": "I encountered an error deciding what to do next. Please try rephrasing your request.",
            "tokens_used": tokens,
        }

    next_agent = decision.get("next", "FINISH")
    update: dict = {
        "next_agent": next_agent,
        "tokens_used": tokens,
        "messages": [{"role": "assistant", "content": response_text}],
    }

    if next_agent == "FINISH":
        update["final_answer"] = decision.get("answer", "Task complete.")

    log.info("supervisor_decision", next=next_agent, task_id=state["task_id"])
    return update
