import json
import re

import structlog

from agents.base import SUPERVISOR_MODEL, build_context_block, call_groq
from agents.state import AgentState

log = structlog.get_logger()

SYSTEM_PROMPT = """You are Synapse Supervisor — an orchestration agent that breaks down complex tasks
and delegates them to the right specialist.

Available specialists:
- researcher  : searches the web and synthesises information from real sources
- coder       : writes Python code and executes it; use for ANY programming or math task
- analyst     : reasons over data, does step-by-step calculations, draws conclusions from results
- writer      : produces long-form text, reports, essays, emails, or creative content

Routing rules:
- "write a function / script / code" → coder
- "what is X / how does X work / research X" → researcher
- "analyse / compare / calculate / explain data" → analyst
- "write an essay / report / email / story" → writer
- After researcher finishes → use analyst to interpret results, or writer to present them
- After coder finishes → supervisor can FINISH if the code output is the full answer

Your job:
1. Read the user task and any previous specialist results in the conversation.
2. Decide which specialist to call next (or FINISH if the task is fully answered).
3. Write a precise sub-task instruction for that specialist.

Always respond with valid JSON only — no prose outside the JSON block:

To delegate:
{"next": "<specialist_name>", "subtask": "<clear instruction for the specialist>"}

To finish — the answer field must be plain prose only, NO code blocks and NO triple backticks
(the specialist's code is already shown to the user separately):
{"next": "FINISH", "answer": "<prose summary of what was done and what the result means>"}
"""


def _parse_decision(text: str) -> dict:
    """Extract JSON from the model response even if wrapped in markdown."""
    stripped = text.strip()
    # 1. Try direct parse first (model returned clean JSON)
    try:
        return json.loads(stripped)
    except json.JSONDecodeError:
        pass
    # 2. Strip only the single outermost ```json...``` or ```...``` fence
    outer = re.match(r"^```(?:json)?\s*\n?([\s\S]*?)\n?```\s*$", stripped)
    if outer:
        try:
            return json.loads(outer.group(1).strip())
        except json.JSONDecodeError:
            pass
    # 3. Last resort: grab the first outermost {...} block (handles leading prose)
    brace = re.search(r"\{[\s\S]*\}", stripped)
    if brace:
        try:
            return json.loads(brace.group())
        except json.JSONDecodeError:
            pass
    raise ValueError(f"Could not parse supervisor decision: {text[:200]}")


MAX_HISTORY_MSGS = 6  # keep last N messages to stay under free-tier TPM limits

def supervisor_node(state: AgentState) -> dict:
    log.info("supervisor", task_id=state["task_id"], loop=state["loop_count"])

    # Hard stop: prevent runaway loops that burn the free-tier quota
    if state["loop_count"] >= 8:
        return {
            "next_agent": "FINISH",
            "final_answer": "Reached the maximum number of agent steps. Here is what was gathered so far.",
            "tokens_used": 0,
        }

    # System prompt must be first so Groq follows JSON-only instructions
    memory_block = build_context_block(state.get("memory_context", []))
    messages = [{"role": "system", "content": SYSTEM_PROMPT + memory_block}]
    messages.append({"role": "user", "content": state["input"]})
    # Only send the most recent messages to stay within free-tier TPM limits
    messages.extend(state.get("messages", [])[-MAX_HISTORY_MSGS:])

    response_text, tokens = call_groq(
        messages=messages,
        model=SUPERVISOR_MODEL,
        temperature=0.1,  # low temp — we want deterministic routing
        max_tokens=512,
    )

    try:
        decision = _parse_decision(response_text)
    except ValueError as exc:
        log.error("supervisor_parse_error", error=str(exc), raw_response=response_text[:500])
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
