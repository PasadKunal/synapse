import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.auth import get_current_user
from api.database import get_db
from api.models import Task
from api.rate_limiter import rate_limit_dependency

router = APIRouter(tags=["tasks"])


class TaskCreate(BaseModel):
    input: str
    token_budget: int = 50000


class TaskResponse(BaseModel):
    id: str
    status: str
    input: str
    result: dict | None
    token_cost: int

    model_config = {"from_attributes": True}


@router.post("/", response_model=TaskResponse, dependencies=[Depends(rate_limit_dependency)])
async def create_task(
    body: TaskCreate,
    user_id: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    task = Task(
        id=uuid.uuid4(),
        user_id=uuid.UUID(user_id),
        input=body.input,
        status="pending",
    )
    db.add(task)
    await db.commit()
    await db.refresh(task)

    # Enqueue to Celery (imported lazily to avoid circular imports)
    from api.celery_app import run_agent_task

    run_agent_task.apply_async(
        args=[str(task.id), body.input, user_id],
        task_id=str(uuid.uuid5(uuid.NAMESPACE_DNS, str(task.id))),
    )

    return TaskResponse(
        id=str(task.id),
        status=task.status,
        input=task.input,
        result=task.result,
        token_cost=task.token_cost,
    )


@router.get("/{task_id}", response_model=TaskResponse)
async def get_task(
    task_id: str,
    user_id: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Task).where(Task.id == uuid.UUID(task_id), Task.user_id == uuid.UUID(user_id))
    )
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Task not found")

    return TaskResponse(
        id=str(task.id),
        status=task.status,
        input=task.input,
        result=task.result,
        token_cost=task.token_cost,
    )


@router.get("/", response_model=list[TaskResponse])
async def list_tasks(
    user_id: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Task).where(Task.user_id == uuid.UUID(user_id)).order_by(Task.created_at.desc()).limit(50)
    )
    tasks = result.scalars().all()
    return [
        TaskResponse(
            id=str(t.id),
            status=t.status,
            input=t.input,
            result=t.result,
            token_cost=t.token_cost,
        )
        for t in tasks
    ]
