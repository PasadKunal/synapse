"""
pgvector episodic memory store.

Stores task outputs as text chunks with 384-dim embeddings.
Retrieval uses MMR (Maximal Marginal Relevance) to return
results that are both relevant AND diverse — avoids returning
5 near-identical chunks when the DB has redundant entries.
"""

import uuid

import numpy as np
import structlog
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from api.config import settings
from api.models import EpisodicMemory
from memory.embeddings import embed

log = structlog.get_logger()


async def store_episode(
    session: AsyncSession,
    user_id: str,
    content: str,
    task_id: str | None = None,
) -> None:
    """Embed and store a memory chunk for a user."""
    vector = embed(content)
    episode = EpisodicMemory(
        user_id=uuid.UUID(user_id),
        task_id=uuid.UUID(task_id) if task_id else None,
        content=content,
        embedding=vector,
    )
    session.add(episode)
    await session.commit()
    log.info("episode_stored", user_id=user_id, content_len=len(content))


async def retrieve_relevant(
    session: AsyncSession,
    user_id: str,
    query: str,
    k: int = 5,
    fetch_k: int = 20,
    lambda_mult: float = 0.5,
) -> list[str]:
    """
    MMR retrieval: fetch_k candidates by cosine similarity, then
    select k of them maximising relevance - redundancy.

    lambda_mult=1.0 → pure similarity (may return duplicates)
    lambda_mult=0.0 → pure diversity (ignores relevance)
    lambda_mult=0.5 → balanced (default)
    """
    query_vec = embed(query)

    rows = await session.execute(
        text("""
            SELECT content, embedding,
                   1 - (embedding <=> CAST(:qv AS vector)) AS similarity
            FROM episodic_memory
            WHERE user_id = :uid
            ORDER BY embedding <=> CAST(:qv AS vector)
            LIMIT :limit
        """),
        {"qv": str(query_vec), "uid": str(user_id), "limit": fetch_k},
    )
    candidates = rows.fetchall()

    if not candidates:
        return []

    if len(candidates) <= k:
        return [row.content for row in candidates]

    return _mmr_select(query_vec, candidates, k, lambda_mult)


def _mmr_select(
    query_vec: list[float],
    candidates: list,
    k: int,
    lambda_mult: float,
) -> list[str]:
    """
    Greedy MMR selection.
    At each step, pick the candidate that maximises:
        lambda * relevance_to_query - (1 - lambda) * max_similarity_to_selected
    """
    q = np.array(query_vec)
    embeddings = [np.array(row.embedding) for row in candidates]
    contents = [row.content for row in candidates]

    selected_indices: list[int] = []
    remaining = list(range(len(candidates)))

    while len(selected_indices) < k and remaining:
        best_idx = None
        best_score = float("-inf")

        for i in remaining:
            relevance = float(np.dot(embeddings[i], q))  # already normalised

            if not selected_indices:
                diversity_penalty = 0.0
            else:
                sims_to_selected = [
                    float(np.dot(embeddings[i], embeddings[j]))
                    for j in selected_indices
                ]
                diversity_penalty = max(sims_to_selected)

            score = lambda_mult * relevance - (1 - lambda_mult) * diversity_penalty
            if score > best_score:
                best_score = score
                best_idx = i

        if best_idx is None:
            break
        selected_indices.append(best_idx)
        remaining.remove(best_idx)

    return [contents[i] for i in selected_indices]


async def check_semantic_cache(
    session: AsyncSession,
    user_id: str,
    query: str,
) -> str | None:
    """
    If a nearly identical query (cosine similarity > threshold) was answered
    before, return the cached answer — skip running the agent entirely.
    """
    threshold = settings.dedup_similarity_threshold
    query_vec = embed(query)

    row = await session.execute(
        text("""
            SELECT t.result
            FROM episodic_memory e
            JOIN tasks t ON e.task_id = t.id
            WHERE e.user_id = :uid
              AND t.status = 'done'
              AND 1 - (e.embedding <=> CAST(:qv AS vector)) > :threshold
            ORDER BY e.embedding <=> CAST(:qv AS vector)
            LIMIT 1
        """),
        {"qv": str(query_vec), "uid": str(user_id), "threshold": threshold},
    )
    result = row.fetchone()
    if result and result.result:
        log.info("cache_hit", user_id=user_id, threshold=threshold)
        return result.result.get("answer")
    return None
