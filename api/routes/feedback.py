import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.auth import get_current_user
from api.database import get_db
from api.models import DPOPair, Task

router = APIRouter(tags=["feedback"])


class FeedbackBody(BaseModel):
    thumbs_up: bool
    comment: str = ""


@router.post("/tasks/{task_id}/feedback", status_code=201)
async def submit_feedback(
    task_id: str,
    body: FeedbackBody,
    user_id: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Store a DPO preference pair when the user rates a result.
    thumbs_up=True  → this answer is the 'chosen' (good) response
    thumbs_up=False → this answer is the 'rejected' (bad) response

    Both sides of the pair are stored immediately; fine-tuning happens offline later.
    """
    result = await db.execute(
        select(Task).where(Task.id == uuid.UUID(task_id), Task.user_id == uuid.UUID(user_id))
    )
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Task not found")

    if not task.result:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Task has no result yet")

    answer = task.result.get("answer", "")
    placeholder = body.comment or "No alternative provided"

    pair = DPOPair(
        task_id=task.id,
        prompt=task.input,
        chosen=answer if body.thumbs_up else placeholder,
        rejected=placeholder if body.thumbs_up else answer,
    )
    db.add(pair)
    await db.commit()

    return {"status": "recorded", "thumbs_up": body.thumbs_up}
