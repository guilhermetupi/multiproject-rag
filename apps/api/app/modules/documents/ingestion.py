import re
from dataclasses import dataclass
from pathlib import Path

from fastapi import HTTPException, status
from pypdf import PdfReader
from sqlalchemy import delete
from sqlalchemy.orm import Session

from app.core.embeddings import get_embeddings
from app.modules.documents.models import Document, DocumentChunk

SUPPORTED_TEXT_CONTENT_TYPES = {
    "text/plain",
    "text/markdown",
    "application/pdf",
}

SECTION_RE = re.compile(
    r"^\s*(?P<number>[0-9]+(?:\.[0-9]+)*)\s*[-.]\s+(?P<title>.+?)(?:\s*\.\.\.+)?$",
    re.MULTILINE,
)

CHUNK_SIZE = 1300
CHUNK_OVERLAP = 300


@dataclass
class TextSection:
    content: str
    page_number: int | None = None
    section_title: str | None = None


def ingest_document(
    db: Session,
    document: Document,
) -> Document:
    if document.content_type not in SUPPORTED_TEXT_CONTENT_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Document type is not supported for ingestion yet",
        )

    if not document.storage_path:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Document has no storage path",
        )

    storage_path = Path(document.storage_path)

    if not storage_path.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Stored document file not found",
        )

    try:
        document.status = "processing"
        document.error_message = None
        db.commit()
        db.refresh(document)

        sections = _read_document(storage_path, document.content_type)

        text_content = " ".join(s.content for s in sections)
        if not text_content.strip():
            raise ValueError("Document has no text content")

        chunks = _chunk_sections(sections)

        db.execute(
            delete(DocumentChunk).where(
                DocumentChunk.project_id == document.project_id,
                DocumentChunk.document_id == document.id,
            )
        )

        for index, (chunk_content, page_number, section_title) in enumerate(chunks):
            chunk = DocumentChunk(
                project_id=document.project_id,
                document_id=document.id,
                chunk_index=index,
                content=chunk_content,
                page_number=page_number,
                section_title=section_title,
            )
            db.add(chunk)

        db.flush()

        chunk_contents = [c[0] for c in chunks]
        embeddings = get_embeddings(chunk_contents)

        db_chunks = (
            db.query(DocumentChunk)
            .filter(
                DocumentChunk.project_id == document.project_id,
                DocumentChunk.document_id == document.id,
            )
            .order_by(DocumentChunk.chunk_index.asc())
            .all()
        )

        for chunk, embedding in zip(db_chunks, embeddings):
            chunk.embedding = embedding

        document.status = "processed"
        document.error_message = None

        db.commit()
        db.refresh(document)

        return document

    except Exception as exc:
        db.rollback()

        document.status = "failed"
        document.error_message = str(exc)

        db.add(document)
        db.commit()
        db.refresh(document)

        return document


def _read_document(path: Path, content_type: str | None) -> list[TextSection]:
    if content_type == "application/pdf":
        return _read_pdf_file(path)
    return [_read_text_file(path)]


def _read_text_file(path: Path) -> TextSection:
    text = path.read_text(encoding="utf-8")
    return TextSection(content=text)


def _read_pdf_file(path: Path) -> list[TextSection]:
    reader = PdfReader(str(path))
    sections: list[TextSection] = []

    for page_number, page in enumerate(reader.pages, start=1):
        text = page.extract_text()
        if text and text.strip():
            sections.append(
                TextSection(
                    content=text.strip(),
                    page_number=page_number,
                )
            )

    if not sections:
        raise ValueError("PDF has no extractable text")

    return sections


def _detect_sections(text: str) -> list[tuple[int, str]]:
    """Return list of (position, title) for each section header found."""
    sections: list[tuple[int, str]] = []
    for match in SECTION_RE.finditer(text):
        title = f"{match.group('number')} - {match.group('title').strip()}"
        sections.append((match.start(), title))
    return sections


def _chunk_sections(
    sections: list[TextSection],
    chunk_size: int = CHUNK_SIZE,
    chunk_overlap: int = CHUNK_OVERLAP,
) -> list[tuple[str, int | None, str | None]]:
    if chunk_overlap >= chunk_size:
        raise ValueError("chunk_overlap must be smaller than chunk_size")

    result: list[tuple[str, int | None, str | None]] = []

    for section in sections:
        normalized = _normalize_text(section.content)

        if not normalized:
            continue

        doc_sections = _detect_sections(normalized)

        if len(normalized) <= chunk_size:
            title = _find_section_title(0, doc_sections) or section.section_title
            result.append((normalized, section.page_number, title))
            continue

        start = 0
        while start < len(normalized):
            end = min(start + chunk_size, len(normalized))
            chunk = normalized[start:end].strip()

            if chunk:
                title = (
                    _find_section_title(start, doc_sections) or section.section_title
                )
                result.append((chunk, section.page_number, title))

            if end >= len(normalized):
                break

            start = end - chunk_overlap

    return result


def _find_section_title(
    pos: int,
    sections: list[tuple[int, str]],
) -> str | None:
    """Find the closest section header that starts at or before pos."""
    best: str | None = None
    for sec_start, title in sections:
        if sec_start <= pos:
            best = title
        else:
            break
    return best


def _normalize_text(text: str) -> str:
    lines = [line.rstrip() for line in text.splitlines()]
    return "\n".join(lines).strip()
