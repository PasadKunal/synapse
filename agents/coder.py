import re
import subprocess
import textwrap

import structlog

from agents.base import SPECIALIST_MODEL, build_context_block, call_groq
from agents.state import AgentState

log = structlog.get_logger()

SYSTEM_PROMPT = """You are a coding specialist. When given a programming task:
1. Write clean, correct Python code that solves it.
2. Wrap the code in a ```python ... ``` block.
3. After the code block, briefly explain what it does.

The code will be executed in a sandboxed subprocess. Keep it self-contained — no file I/O,
no network calls, no installing packages. Use only the Python standard library."""

EXECUTION_TIMEOUT = 10  # seconds


def _extract_code(text: str) -> str | None:
    """Pull the first ```python ... ``` block from the model response."""
    match = re.search(r"```python\s*(.*?)```", text, re.DOTALL)
    return textwrap.dedent(match.group(1)).strip() if match else None


def _run_code(code: str) -> tuple[str, str]:
    """
    Execute Python code in a subprocess with a hard timeout.
    Returns (stdout, stderr).
    """
    try:
        result = subprocess.run(
            ["python3", "-c", code],
            capture_output=True,
            text=True,
            timeout=EXECUTION_TIMEOUT,
        )
        return result.stdout.strip(), result.stderr.strip()
    except subprocess.TimeoutExpired:
        return "", f"Execution timed out after {EXECUTION_TIMEOUT}s"
    except Exception as exc:
        return "", str(exc)


def coder_node(state: AgentState) -> dict:
    last_msg = state["messages"][-1]["content"] if state["messages"] else state["input"]
    log.info("coder", task_id=state["task_id"], subtask=last_msg[:80])

    memory_block = build_context_block(state.get("memory_context", []))
    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": f"{last_msg}{memory_block}"},
    ]

    response_text, tokens = call_groq(
        messages=messages,
        model=SPECIALIST_MODEL,
        temperature=0.1,
        max_tokens=2048,
    )

    # Try to run the generated code and feed result back in
    code = _extract_code(response_text)
    execution_note = ""
    if code:
        stdout, stderr = _run_code(code)
        if stdout:
            execution_note = f"\n\nExecution output:\n```\n{stdout}\n```"
        if stderr:
            execution_note += f"\n\nExecution errors:\n```\n{stderr}\n```"

    result_content = f"Coder result:\n{response_text}{execution_note}"

    log.info("coder_done", task_id=state["task_id"], tokens=tokens, ran_code=bool(code))
    return {
        "messages": [{"role": "user", "content": result_content}],
        "tokens_used": tokens,
        "loop_count": state["loop_count"] + 1,
    }
