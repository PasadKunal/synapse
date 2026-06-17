"""add auth fields to users

Revision ID: b3c7e1a29d84
Revises: 8aee5ab98517
Create Date: 2026-06-17

"""
from alembic import op
import sqlalchemy as sa

revision = "b3c7e1a29d84"
down_revision = "8aee5ab98517"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("username", sa.String(100), nullable=True))
    op.add_column("users", sa.Column("password_hash", sa.String(255), nullable=True))
    op.add_column("users", sa.Column("is_demo", sa.Boolean(), nullable=False, server_default="false"))
    op.create_unique_constraint("uq_users_username", "users", ["username"])


def downgrade() -> None:
    op.drop_constraint("uq_users_username", "users", type_="unique")
    op.drop_column("users", "is_demo")
    op.drop_column("users", "password_hash")
    op.drop_column("users", "username")
