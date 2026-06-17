"""
pgvector episodic memory store.

Stores task outputs as text chunks with 384-dim embeddings.
Retrieval uses MMR (Maximal Marginal Relevance) to return results
that are both relevant and diverse, avoiding redundant chunks.
"""

import uuid

import numpy as np
import structlog
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from api.models import EpisodicMemory
from memory.embeddings import embed

log = structlog.get_logger()

# Cache entries live alongside regular episodic memory but use this prefix
# so retrieve_relevant() can exclude them and check_semantic_cache() can find them.
_CACHE_PREFIX = "CACHE::"


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
              AND content NOT LIKE 'CACHE::%'
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
    threshold: float = 0.92,
) -> str | None:
    """
    Look for a previously answered near-identical query.
    The embedding is stored against the original query text, so cosine
    similarity works correctly even though the content holds the answer.
    Returns the cached answer string, or None if no match above threshold.
    """
    query_vec = embed(query)

    rows = await session.execute(
        text("""
            SELECT content,
                   1 - (embedding <=> CAST(:qv AS vector)) AS similarity
            FROM episodic_memory
            WHERE user_id = :uid
              AND content LIKE 'CACHE::%'
            ORDER BY embedding <=> CAST(:qv AS vector)
            LIMIT 1
        """),
        {"qv": str(query_vec), "uid": str(user_id)},
    )
    row = rows.fetchone()

    if row and float(row.similarity) >= threshold:
        log.info("semantic_cache_hit", user_id=user_id, similarity=round(float(row.similarity), 3))
        return row.content[len(_CACHE_PREFIX):]

    return None


async def store_cache_entry(
    session: AsyncSession,
    user_id: str,
    query: str,
    answer: str,
    task_id: str | None = None,
) -> None:
    """
    Store a query-answer pair so future near-identical queries can skip the agents.
    The embedding is of the QUERY (not the answer) so similarity checks work correctly.
    """
    vector = embed(query)
    episode = EpisodicMemory(
        user_id=uuid.UUID(user_id),
        task_id=uuid.UUID(task_id) if task_id else None,
        content=f"{_CACHE_PREFIX}{answer}",
        embedding=vector,
    )
    session.add(episode)
    await session.commit()
    log.info("cache_entry_stored", user_id=user_id)
