from pgvector.sqlalchemy import Vector
from sqlalchemy import bindparam, text
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.embeddings import get_embedding

VECTOR_WEIGHT = 0.6
TEXT_WEIGHT = 0.4


def retrieve_chunks(
    db: Session,
    project_id: str,
    query: str,
    top_k: int | None = None,
) -> list[dict]:
    if top_k is None:
        top_k = settings.max_retrieval_chunks

    embedding = get_embedding(query)

    stmt = text(
        """
        WITH chunks_ranked AS (
            SELECT
                dc.id,
                dc.document_id,
                dc.chunk_index,
                dc.content,
                dc.page_number,
                dc.section_title,
                1 - (dc.embedding <=> :embedding) AS vector_score,
                COALESCE(
                    ts_rank(
                        to_tsvector('portuguese', dc.content),
                        plainto_tsquery('portuguese', :query_text)
                    ), 0
                ) AS text_score,
                (
                    (1 - (dc.embedding <=> :embedding)) * :vector_weight
                    + COALESCE(
                        ts_rank(
                            to_tsvector('portuguese', dc.content),
                            plainto_tsquery('portuguese', :query_text)
                        ), 0
                    ) * :text_weight
                ) AS similarity,
                'document_chunk' AS source_type
            FROM document_chunks dc
            WHERE dc.project_id = :project_id
              AND dc.embedding IS NOT NULL
        ),
        faqs_ranked AS (
            SELECT
                f.id,
                NULL::varchar AS document_id,
                NULL::integer AS chunk_index,
                ('Pergunta: ' || f.question || ' Resposta: ' || f.answer) AS content,
                NULL::integer AS page_number,
                'FAQ' AS section_title,
                1 - (f.embedding <=> :embedding) AS vector_score,
                COALESCE(
                    ts_rank(
                        to_tsvector('portuguese', f.question || ' ' || f.answer),
                        plainto_tsquery('portuguese', :query_text)
                    ), 0
                ) AS text_score,
                (
                    (1 - (f.embedding <=> :embedding)) * :vector_weight
                    + COALESCE(
                        ts_rank(
                            to_tsvector('portuguese', f.question || ' ' || f.answer),
                            plainto_tsquery('portuguese', :query_text)
                        ), 0
                    ) * :text_weight
                ) AS similarity,
                'faq' AS source_type
            FROM faqs f
            WHERE f.project_id = :project_id
              AND f.embedding IS NOT NULL
        ),
        combined AS (
            SELECT * FROM chunks_ranked
            UNION ALL
            SELECT * FROM faqs_ranked
        )
        SELECT *
        FROM combined
        ORDER BY similarity DESC
        LIMIT :top_k
        """
    ).bindparams(
        bindparam("embedding", type_=Vector(1024)),
    )

    rows = db.execute(
        stmt,
        {
            "project_id": project_id,
            "embedding": embedding,
            "query_text": query,
            "vector_weight": VECTOR_WEIGHT,
            "text_weight": TEXT_WEIGHT,
            "top_k": top_k,
        },
    ).mappings().all()

    return [
        {
            "id": row["id"],
            "document_id": row["document_id"],
            "chunk_index": row["chunk_index"],
            "content": row["content"],
            "page_number": row["page_number"],
            "section_title": row["section_title"],
            "similarity": round(float(row["similarity"]), 4),
            "source_type": row["source_type"],
        }
        for row in rows
    ]
