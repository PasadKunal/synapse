"""
Quick end-to-end test script.
Creates a test user, gets a JWT, sends a task, polls for the result.

Run with:
    python tests/test_agent.py
"""

import asyncio
import sys
import time

import httpx
from jose import jwt

sys.path.insert(0, ".")
from api.config import settings

BASE_URL = "http://localhost:8000"


def make_test_token(user_id: str = "00000000-0000-0000-0000-000000000001") -> str:
    """Generate a valid JWT for testing, same logic as create_access_token()."""
    from datetime import datetime, timedelta, timezone
    expire = datetime.now(timezone.utc) + timedelta(hours=1)
    return jwt.encode(
        {"sub": user_id, "exp": expire},
        settings.secret_key,
        algorithm=settings.algorithm,
    )


async def create_test_user(user_id: str):
    """Insert a test user directly into Postgres so the JWT is valid."""
    import uuid
    from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
    from sqlalchemy import select
    from api.models import User

    engine = create_async_engine(settings.database_url)
    async with AsyncSession(engine) as session:
        existing = await session.execute(select(User).where(User.id == uuid.UUID(user_id)))
        if not existing.scalar_one_or_none():
            user = User(
                id=uuid.UUID(user_id),
                email="test@synapse.dev",
                google_id="test-google-id",
            )
            session.add(user)
            await session.commit()
            print(f"✓ Created test user: {user_id}")
        else:
            print(f"✓ Test user already exists: {user_id}")
    await engine.dispose()


async def main():
    user_id = "00000000-0000-0000-0000-000000000001"

    print("\n=== Synapse End-to-End Test ===\n")

    # 1. Create test user
    await create_test_user(user_id)

    # 2. Generate JWT
    token = make_test_token(user_id)
    headers = {"Authorization": f"Bearer {token}"}
    print(f"✓ JWT token generated")

    # 3. Submit a task
    question = "What is the capital of France and what is it famous for?"
    print(f"\n→ Submitting task: '{question}'")

    async with httpx.AsyncClient(base_url=BASE_URL, timeout=30) as client:
        resp = await client.post("/tasks/", json={"input": question}, headers=headers)
        resp.raise_for_status()
        task = resp.json()
        task_id = task["id"]
        print(f"✓ Task created: {task_id}")
        print(f"  Status: {task['status']}")

        # 4. Poll until done
        print(f"\n⏳ Waiting for agent to finish (check Celery terminal)...")
        for i in range(60):  # poll up to 60 seconds
            await asyncio.sleep(2)
            resp = await client.get(f"/tasks/{task_id}", headers=headers)
            task = resp.json()
            status = task["status"]
            print(f"  [{i*2}s] status={status}", end="\r")

            if status == "done":
                print(f"\n\n✅ Task completed!")
                print(f"   Tokens used: {task['token_cost']}")
                print(f"\n--- Answer ---")
                print(task["result"]["answer"])
                break
            elif status == "failed":
                print(f"\n\n❌ Task failed!")
                print(task["result"])
                break
        else:
            print(f"\n⚠️  Timed out after 120s. Check Celery worker logs.")


if __name__ == "__main__":
    asyncio.run(main())
