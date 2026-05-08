import json

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import require_admin, require_public_project_access
from app.core.embeddings import EmbeddingError
from app.core.llm import LLMError, generate_chat_response, stream_chat_response
from app.core.retriever import retrieve_chunks
from app.db.session import SessionLocal, get_db
from app.modules.chat.models import ChatMessage, ChatSession
from app.modules.chat.schemas import (
    ChatMessageResponse,
    ChatRequest,
    ChatResponse,
    ChatSessionDetailResponse,
    ChatSessionResponse,
    ChatSource,
)
from app.modules.projects.service import get_project

router = APIRouter()

DEFAULT_SYSTEM_PROMPT = """\
You are a helpful assistant that answers questions based on the provided context.

Instructions:
- Answer using only the context below. If the context does not contain the answer, say you don't know.
- Be concise and cite the source documents when relevant.
- Context is provided as numbered chunks. Reference chunks by their number when citing.

Context:
{context}\
"""

FALLBACK_ANSWER = (
    "I could not find any relevant documents in this project to answer your question. "
    "Try uploading some documents first, or rephrase your question."
)


def _build_context(chunks: list[dict]) -> str:
    parts: list[str] = []

    for i, chunk in enumerate(chunks, start=1):
        source_label = "FAQ" if chunk.get("source_type") == "faq" else "Chunk"
        header = f"[{source_label} {i}]"

        if chunk["section_title"] and chunk.get("source_type") != "faq":
            header += f" (Section: {chunk['section_title']})"
        if chunk["page_number"]:
            header += f" (Page {chunk['page_number']})"

        parts.append(f"{header}\n{chunk['content']}")

    return "\n\n".join(parts)


def _get_system_prompt(db: Session, project_id: str) -> str:
    project = get_project(db, project_id)
    if project.system_prompt:
        return project.system_prompt + "\n\n" + DEFAULT_SYSTEM_PROMPT
    return DEFAULT_SYSTEM_PROMPT


@router.post(
    "",
    response_model=ChatResponse,
    dependencies=[Depends(require_public_project_access)],
)
def chat_with_project(
    project_id: str,
    payload: ChatRequest,
    db: Session = Depends(get_db),
):
    project = get_project(db, project_id)

    session = _get_or_create_session(db, project_id, payload.session_id)

    user_message = ChatMessage(
        session_id=session.id,
        role="user",
        content=payload.message,
    )
    db.add(user_message)
    db.commit()

    try:
        chunks = retrieve_chunks(db, project_id, payload.message)
    except EmbeddingError:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Embedding service is unavailable",
        )

    if not chunks:
        assistant_message = ChatMessage(
            session_id=session.id,
            role="assistant",
            content=FALLBACK_ANSWER,
        )
        db.add(assistant_message)
        db.commit()

        return ChatResponse(answer=FALLBACK_ANSWER, session_id=session.id, sources=[])

    context = _build_context(chunks)
    system_prompt = _get_system_prompt(db, project_id)
    prompt = system_prompt.format(context=context)

    try:
        answer = generate_chat_response(
            prompt, payload.message,
            provider=project.provider,
            model_name=project.model_name,
            api_key=project.api_key,
        )
    except LLMError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(exc),
        )

    assistant_message = ChatMessage(
        session_id=session.id,
        role="assistant",
        content=answer,
    )
    db.add(assistant_message)
    db.commit()

    sources = [
        ChatSource(
            document_id=chunk["document_id"],
            chunk_id=chunk["id"],
            title=chunk["section_title"],
            score=round(chunk["similarity"], 4),
        )
        for chunk in chunks
    ]

    return ChatResponse(answer=answer, session_id=session.id, sources=sources)


@router.post(
    "/stream",
    dependencies=[Depends(require_public_project_access)],
)
def chat_stream(
    project_id: str,
    payload: ChatRequest,
    db: Session = Depends(get_db),
):
    project = get_project(db, project_id)
    session = _get_or_create_session(db, project_id, payload.session_id)

    user_message = ChatMessage(
        session_id=session.id,
        role="user",
        content=payload.message,
    )
    db.add(user_message)
    db.commit()

    try:
        chunks = retrieve_chunks(db, project_id, payload.message)
    except EmbeddingError:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Embedding service is unavailable",
        )

    saved_session_id = session.id

    if not chunks:
        assistant_message = ChatMessage(
            session_id=saved_session_id,
            role="assistant",
            content=FALLBACK_ANSWER,
        )
        db.add(assistant_message)
        db.commit()

        def empty_generate():
            yield f"data: {json.dumps({'type': 'token', 'content': FALLBACK_ANSWER})}\n\n"
            yield f"data: {json.dumps({'type': 'done', 'session_id': saved_session_id, 'sources': []})}\n\n"

        return StreamingResponse(empty_generate(), media_type="text/event-stream")

    context = _build_context(chunks)
    system_prompt = _get_system_prompt(db, project_id)
    prompt = system_prompt.format(context=context)

    sources_data = [
        {
            "document_id": chunk["document_id"],
            "chunk_id": chunk["id"],
            "title": chunk["section_title"],
            "score": round(chunk["similarity"], 4),
        }
        for chunk in chunks
    ]

    def generate():
        full_answer = ""
        save_db = SessionLocal()
        try:
            for content, done in stream_chat_response(
                prompt, payload.message,
                provider=project.provider,
                model_name=project.model_name,
                api_key=project.api_key,
            ):
                if content:
                    full_answer += content
                    yield f"data: {json.dumps({'type': 'token', 'content': content})}\n\n"
                if done:
                    break
        except LLMError as exc:
            yield f"data: {json.dumps({'type': 'error', 'message': str(exc)})}\n\n"
            save_db.close()
            return
        except Exception:
            yield f"data: {json.dumps({'type': 'error', 'message': 'LLM streaming failed'})}\n\n"
            save_db.close()
            return

        try:
            assistant_message = ChatMessage(
                session_id=saved_session_id,
                role="assistant",
                content=full_answer,
            )
            save_db.add(assistant_message)
            save_db.commit()
        finally:
            save_db.close()

        yield f"data: {json.dumps({'type': 'done', 'session_id': saved_session_id, 'sources': sources_data})}\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")


@router.get(
    "/sessions",
    response_model=list[ChatSessionResponse],
    dependencies=[Depends(require_admin)],
)
def list_chat_sessions(
    project_id: str,
    db: Session = Depends(get_db),
):
    get_project(db, project_id)

    stmt = (
        select(ChatSession)
        .where(ChatSession.project_id == project_id)
        .order_by(ChatSession.created_at.desc())
    )

    return list(db.scalars(stmt).all())


@router.get(
    "/sessions/{session_id}",
    response_model=ChatSessionDetailResponse,
    dependencies=[Depends(require_admin)],
)
def get_chat_session(
    project_id: str,
    session_id: str,
    db: Session = Depends(get_db),
):
    get_project(db, project_id)

    session = db.get(ChatSession, session_id)

    if not session or session.project_id != project_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Chat session not found",
        )

    return session


def _get_or_create_session(
    db: Session,
    project_id: str,
    session_id: str | None,
) -> ChatSession:
    if session_id:
        session = db.get(ChatSession, session_id)

        if not session or session.project_id != project_id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Chat session not found",
            )

        return session

    session = ChatSession(project_id=project_id)
    db.add(session)
    db.commit()
    db.refresh(session)

    return session
