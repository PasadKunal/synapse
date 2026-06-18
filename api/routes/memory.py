import uuid

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from api.auth import get_current_user
from api.database import get_db
from api.models import EpisodicMemory, Task
from memory.embeddings import embed

router = APIRouter(tags=["memory"])


class MemoryChunk(BaseModel):
    id: str
    content: str
    task_id: str | None
    task_input: str | None
    created_at: str
    similarity: float | None = None


@router.get("/", response_model=list[MemoryChunk])
async def list_memory(
    query: str | None = None,
    limit: int = 30,
    user_id: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if query:
        query_vec = embed(query)
        rows = await db.execute(
            text("""
                SELECT em.id, em.content, em.task_id, em.created_at,
                       t.input AS task_input,
                       1 - (em.embedding <=> CAST(:qv AS vector)) AS similarity
                FROM episodic_memory em
                LEFT JOIN tasks t ON t.id = em.task_id
                WHERE em.user_id = :uid
                  AND em.content NOT LIKE 'CACHE::%'
                ORDER BY em.embedding <=> CAST(:qv AS vector)
                LIMIT :limit
            """),
            {"qv": str(query_vec), "uid": str(user_id), "limit": limit},
        )
        results = rows.fetchall()
        return [
            MemoryChunk(
                id=str(row.id),
                content=row.content,
                task_id=str(row.task_id) if row.task_id else None,
                task_input=row.task_input,
                created_at=row.created_at.isoformat(),
                similarity=round(float(row.similarity), 3),
            )
            for row in results
        ]

    from sqlalchemy.orm import joinedload
    result = await db.execute(
        select(EpisodicMemory)
        .options(joinedload(EpisodicMemory.task))
        .where(
            EpisodicMemory.user_id == uuid.UUID(user_id),
            ~EpisodicMemory.content.like("CACHE::%"),
        )
        .order_by(EpisodicMemory.created_at.desc())
        .limit(limit)
    )
    memories = result.unique().scalars().all()
    return [
        MemoryChunk(
            id=str(m.id),
            content=m.content,
            task_id=str(m.task_id) if m.task_id else None,
            task_input=m.task.input if m.task else None,
            created_at=m.created_at.isoformat(),
            similarity=None,
        )
        for m in memories
    ]
