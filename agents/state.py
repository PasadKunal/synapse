import operator
from typing import Annotated, TypedDict


class AgentState(TypedDict):
    task_id: str
    user_id: str
    input: str

    # append-only list — each agent adds its message, nothing is overwritten
    messages: Annotated[list[dict], operator.add]

    # supervisor writes this to tell the graph which node to visit next
    next_agent: str

    # set by the last node before FINISH
    final_answer: str | None

    # token tracking — add-only so parallel nodes don't clobber each other
    token_budget: int
    tokens_used: Annotated[int, operator.add]

    # incremented by loop_detector; triggers early exit at MAX_LOOPS
    loop_count: int

    # episodic memory chunks injected by the memory layer before agent calls
    memory_context: list[str]
