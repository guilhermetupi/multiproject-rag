"""add_pgvector_embedding_to_document_chunks

Revision ID: 50abfccd19b9
Revises: 28bda2987e0a
Create Date: 2026-05-08 01:02:50.325535

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from pgvector.sqlalchemy import Vector


# revision identifiers, used by Alembic.
revision: str = '50abfccd19b9'
down_revision: Union[str, Sequence[str], None] = '28bda2987e0a'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")

    op.add_column(
        "document_chunks",
        sa.Column("embedding", Vector(1024), nullable=True),
    )

    op.execute(
        "CREATE INDEX ix_document_chunks_embedding "
        "ON document_chunks "
        "USING hnsw (embedding vector_cosine_ops)"
    )


def downgrade() -> None:
    op.drop_index("ix_document_chunks_embedding")
    op.drop_column("document_chunks", "embedding")
