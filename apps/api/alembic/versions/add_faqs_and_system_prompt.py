"""add faqs table and system_prompt to projects

Revision ID: d4e1f8c3a2b9
Revises: 50abfccd19b9
Create Date: 2026-05-08 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from pgvector.sqlalchemy import Vector


revision: str = 'd4e1f8c3a2b9'
down_revision: Union[str, Sequence[str], None] = '50abfccd19b9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'projects',
        sa.Column('system_prompt', sa.Text(), nullable=True),
    )

    op.create_table('faqs',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('project_id', sa.String(length=36), nullable=False),
        sa.Column('question', sa.Text(), nullable=False),
        sa.Column('answer', sa.Text(), nullable=False),
        sa.Column('embedding', Vector(1024), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['project_id'], ['projects.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_faqs_project_id'), 'faqs', ['project_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_faqs_project_id'), table_name='faqs')
    op.drop_table('faqs')
    op.drop_column('projects', 'system_prompt')
