import structlog
from langgraph.checkpoint.memory import MemorySaver
from langgraph.graph import END, StateGraph

from agents.analyst import analyst_node
from agents.coder import coder_node
from agents.researcher import researcher_node
from agents.state import AgentState
from agents.supervisor import supervisor_node
from agents.writer import writer_node
from api.config import settings

log = structlog.get_logger()

# ── Safety guard nodes ────────────────────────────────────────────────────────

def budget_check_node(state: AgentState) -> dict:
    """Stop the graph if the token budget is exhausted."""
    remaining = state["token_budget"] - state["tokens_used"]
    if remaining < 500:
        log.warning("budget_exhausted", task_id=state["task_id"], used=state["tokens_used"])
        last = state["messages"][-1]["content"] if state["messages"] else "No result yet."
        return {
            "next_agent": "FINISH",
            "final_answer": f"Token budget reached. Best result so far:\n\n{last}",
        }
    return {}  # pass-through — no state change


def loop_check_node(state: AgentState) -> dict:
    """Stop the graph if the agent has looped too many times."""
    if state["loop_count"] >= settings.max_agent_loops:
        log.warning("loop_limit", task_id=state["task_id"], loops=state["loop_count"])
        last = state["messages"][-1]["content"] if state["messages"] else "No result yet."
        return {
            "next_agent": "FINISH",
            "final_answer": f"Max iterations reached. Best result so far:\n\n{last}",
        }
    return {}  # pass-through


# ── Routing logic ─────────────────────────────────────────────────────────────

def _route_from_supervisor(state: AgentState) -> str:
    """Read next_agent and return the node name to visit."""
    next_agent = state.get("next_agent", "FINISH")
    if next_agent == "FINISH":
        return END
    return next_agent


def _route_after_safety(state: AgentState) -> str:
    """After budget/loop checks, either end or go back to supervisor."""
    if state.get("next_agent") == "FINISH":
        return END
    return "supervisor"


# ── Graph assembly ────────────────────────────────────────────────────────────

def build_graph():
    """
    Assemble and compile the Synapse agent graph.

    Flow:
      supervisor
        ├── researcher ──┐
        ├── coder        ├── budget_check ── loop_check ── supervisor (repeat)
        ├── analyst      │                              └── END
        └── writer ──────┘
                └── END (when supervisor says FINISH)
    """
    graph = StateGraph(AgentState)

    # Register all nodes
    graph.add_node("supervisor", supervisor_node)
    graph.add_node("researcher", researcher_node)
    graph.add_node("coder", coder_node)
    graph.add_node("analyst", analyst_node)
    graph.add_node("writer", writer_node)
    graph.add_node("budget_check", budget_check_node)
    graph.add_node("loop_check", loop_check_node)

    # Entry point
    graph.set_entry_point("supervisor")

    # Supervisor routes to one of the specialists OR ends the graph
    graph.add_conditional_edges(
        "supervisor",
        _route_from_supervisor,
        {
            "researcher": "researcher",
            "coder": "coder",
            "analyst": "analyst",
            "writer": "writer",
            END: END,
        },
    )

    # Every specialist feeds into the safety checks
    for specialist in ["researcher", "coder", "analyst", "writer"]:
        graph.add_edge(specialist, "budget_check")

    graph.add_edge("budget_check", "loop_check")

    # After safety checks: either stop or go back to supervisor for next step
    graph.add_conditional_edges(
        "loop_check",
        _route_after_safety,
        {"supervisor": "supervisor", END: END},
    )

    # In-memory checkpointer for now — swap with RedisSaver in production
    checkpointer = MemorySaver()
    return graph.compile(checkpointer=checkpointer)


# Singleton — built once at import time
agent_graph = build_graph()
