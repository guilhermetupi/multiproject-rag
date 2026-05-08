"""add provider, model_name and api_key to projects

Revision ID: c1e2f3a4b5d6
Revises: 9bcdbf0db15d
Create Date: 2026-05-08 16:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'c1e2f3a4b5d6'
down_revision: Union[str, Sequence[str], None] = '9bcdbf0db15d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('projects', sa.Column('provider', sa.String(length=40), nullable=True))
    op.add_column('projects', sa.Column('model_name', sa.String(length=120), nullable=True))
    op.add_column('projects', sa.Column('api_key', sa.String(length=500), nullable=True))


def downgrade() -> None:
    op.drop_column('projects', 'api_key')
    op.drop_column('projects', 'model_name')
    op.drop_column('projects', 'provider')
