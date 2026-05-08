from unittest.mock import MagicMock, patch

from app.core.retriever import retrieve_chunks


class TestBuildContext:
    def test_builds_numbered_context(self):
        from app.modules.chat.router import _build_context

        chunks = [
            {
                "id": "c1",
                "document_id": "d1",
                "chunk_index": 0,
                "content": "First chunk content.",
                "page_number": 1,
                "section_title": "Intro",
                "similarity": 0.95,
            },
            {
                "id": "c2",
                "document_id": "d1",
                "chunk_index": 1,
                "content": "Second chunk content.",
                "page_number": None,
                "section_title": None,
                "similarity": 0.82,
            },
        ]

        result = _build_context(chunks)

        assert "[Chunk 1]" in result
        assert "(Section: Intro)" in result
        assert "(Page 1)" in result
        assert "First chunk content." in result
        assert "[Chunk 2]" in result
        assert "Second chunk content." in result

    def test_empty_chunks_returns_empty_string(self):
        from app.modules.chat.router import _build_context

        assert _build_context([]) == ""


class TestRetrieveChunks:
    def test_returns_chunks_ordered_by_similarity(self):
        embedding = [0.1] * 1024
        rows = [
            {
                "id": "c1",
                "document_id": "d1",
                "chunk_index": 2,
                "content": "Best match.",
                "page_number": 3,
                "section_title": "Relevant",
                "similarity": 0.98,
            },
            {
                "id": "c2",
                "document_id": "d1",
                "chunk_index": 0,
                "content": "Ok match.",
                "page_number": 1,
                "section_title": None,
                "similarity": 0.75,
            },
        ]

        mock_session = MagicMock()
        mock_result = MagicMock()
        mock_result.mappings.return_value.all.return_value = rows
        mock_session.execute.return_value = mock_result

        with patch(
            "app.core.retriever.get_embedding", return_value=embedding
        ):
            result = retrieve_chunks(mock_session, "proj-1", "test query", top_k=5)

        assert len(result) == 2
        assert result[0]["id"] == "c1"
        assert result[0]["similarity"] == 0.98
        assert result[1]["id"] == "c2"

    def test_filters_by_project_id(self):
        embedding = [0.1] * 1024
        mock_session = MagicMock()
        mock_result = MagicMock()
        mock_result.mappings.return_value.all.return_value = []
        mock_session.execute.return_value = mock_result

        with patch(
            "app.core.retriever.get_embedding", return_value=embedding
        ):
            retrieve_chunks(mock_session, "proj-42", "query")

        call_args = mock_session.execute.call_args
        params = call_args[0][1]
        assert params["project_id"] == "proj-42"

    def test_excludes_chunks_without_embeddings(self):
        embedding = [0.1] * 1024
        mock_session = MagicMock()
        mock_result = MagicMock()
        mock_result.mappings.return_value.all.return_value = []
        mock_session.execute.return_value = mock_result

        with patch(
            "app.core.retriever.get_embedding", return_value=embedding
        ):
            result = retrieve_chunks(mock_session, "proj-1", "query")

        sql = mock_session.execute.call_args[0][0].text
        assert "dc.embedding IS NOT NULL" in sql
        assert result == []
