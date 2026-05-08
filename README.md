# Multiproject RAG

RAG (Retrieval-Augmented Generation) system for multiple isolated projects — each with its own documents, FAQs, and optionally its own LLM provider. Upload PDFs, query them via chat with source citations, and manage per-project FAQs that also participate in the retrieval pipeline.

## Architecture

```
┌──────────────────────────────────────────────────────┐
│  apps/web/admin (Next.js)     apps/web/public (Vite) │
│  Admin dashboard              End-user Q&A           │
│  port 3000                    port 5173              │
└──────────────┬──────────────────┬────────────────────┘
               │  REST / SSE      │  REST / SSE
               ▼                  ▼
┌──────────────────────────────────────────────────────┐
│  apps/api (FastAPI + Python)                         │
│  port 8000                                           │
│                                                      │
│  ┌──────────┐  ┌──────────┐  ┌───────────────────┐  │
│  │ Projects │  │Documents │  │ Chat (sessions +   │  │
│  │ (per-proj│  │(upload,  │  │  messages, stream) │  │
│  │  config) │  │ ingest,  │  │                    │  │
│  │          │  │ chunks)  │  │ FAQ (embeddings)   │  │
│  └──────────┘  └──────────┘  └───────────────────┘  │
│                                                      │
│  ┌────────────────────────────────────────────────┐  │
│  │  Hybrid retrieval: vector (pgvector cosine)    │  │
│  │  + full-text (PostgreSQL ts_rank, portuguese)  │  │
│  └────────────────────────────────────────────────┘  │
│                                                      │
│  ┌────────────────────────────────────────────────┐  │
│  │  Multi-provider LLM: Ollama · OpenAI ·         │  │
│  │  Anthropic · Google · DeepSeek                 │  │
│  └────────────────────────────────────────────────┘  │
└─────────────────────┬────────────────────────────────┘
                      │
                      ▼
┌──────────────────────────────────────────────────────┐
│  PostgreSQL 16 + pgvector (docker-compose)           │
│  port 5432                                           │
└──────────────────────────────────────────────────────┘
```

### Repository layout

```
multiproject-rag/
├── apps/
│   ├── api/                  # FastAPI backend (Python 3.13, uv)
│   │   ├── app/
│   │   │   ├── api/          # Deps (auth), router composition
│   │   │   ├── core/         # Config, LLM, embeddings, retriever
│   │   │   ├── db/           # SQLAlchemy base, session, models
│   │   │   └── modules/
│   │   │       ├── projects/ # CRUD + per-project LLM config
│   │   │       ├── documents/# Upload, ingest (PDF → chunks), list
│   │   │       ├── chat/     # Sessions, messages, streaming SSE
│   │   │       └── faqs/     # Q&A with embeddings
│   │   ├── alembic/          # Database migrations
│   │   └── tests/
│   └── web/
│       ├── admin/            # Next.js 16 admin dashboard
│       │   └── src/app/projects/
│       └── public/           # Vite + React public Q&A app
├── packages/
│   ├── contracts/            # OpenAPI spec + generated TS types
│   ├── ui/                   # Shared React components (stub)
│   ├── eslint-config/
│   └── typescript-config/
├── docker-compose.yml        # PostgreSQL 16 + pgvector
├── turbo.json
└── pnpm-workspace.yaml
```

## Key features

### Per-project isolation

Each project has its own document set, FAQ entries, chat sessions, system prompt, and LLM configuration. Nothing leaks between projects.

### Document ingestion pipeline

1. Upload a PDF (or other format) → raw file stored
2. Click **Ingest** → PDF parsed, text split into chunks (~segment-level), each chunk embedded via Ollama (`mxbai-embed-large`, 1024-dim)
3. Chunks stored in `document_chunks` with pgvector embeddings

### Hybrid retrieval

Queries retrieve relevant chunks using a **weighted combination** (configurable in `retriever.py`):

- **Vector similarity** (60%): cosine distance via pgvector `<=>` operator
- **Full-text search** (40%): PostgreSQL `ts_rank` with Portuguese dictionary (`plainto_tsquery('portuguese', query)`)

FAQ entries are stored with embeddings too and participate in the same retrieval query via `UNION ALL` — the model sees both document chunks and FAQ entries in the same ranked context.

### Multi-provider LLM

Each project can be assigned its own LLM provider, model, and API key via the admin Settings tab. Supported providers:

| Provider  | API format             | When to use             |
| --------- | ---------------------- | ----------------------- |
| Ollama    | Native `/api/chat`     | Local dev, no API key   |
| OpenAI    | `/v1/chat/completions` | GPT-4o, GPT-4.1         |
| Anthropic | `/v1/messages`         | Claude Opus 4.7, Sonnet |
| Google    | OpenAI-compat endpoint | Gemini 2.5 Flash/Pro    |
| DeepSeek  | `/v1/chat/completions` | DeepSeek-V3, R1         |

If no provider is set, the project falls back to the global Ollama instance from `config.py`.

### Chat with source citations

- Streaming (SSE) responses via the `/chat/stream` endpoint
- Each response includes ranked sources showing which document chunk or FAQ was used
- Sessions persist across multiple messages for conversation continuity

### FAQ management

Structured Q&A pairs per project. FAQs are embedded and included in retrieval, so the model can cite them alongside document chunks. Useful for regulatory disclaimers, known edge cases, or internal terminology.

### Custom system prompts

Projects can define a custom system prompt (e.g. glossary mappings like "prêmio instantâneo = vale-brinde"). The custom prompt is **prepended** to the default RAG instructions so the model always retains the "answer from context" constraint.

## Architecture decisions

**Why Python for the API?** The AI/ML ecosystem (pgvector, Ollama, embeddings) is Python-native. FastAPI gives us async support, automatic OpenAPI generation, and Pydantic validation.

**Why PostgreSQL + pgvector instead of a dedicated vector DB?** Single infrastructure dependency. pgvector handles cosine similarity natively, and we already need PostgreSQL for relational data (projects, documents, sessions). The hybrid text+vector search is a single SQL query.

**Why two frontend apps?** The admin dashboard (Next.js) needs routing, forms, and a rich UI. The public Q&A app (Vite) is a lightweight SPA — one screen, zero routes. Separate builds keep the public bundle small and fast.

**Why the API is outside Turborepo?** It's Python, managed by `uv`, not by pnpm. Turborepo orchestrates only the Node.js apps and packages.

**Why OpenAPI as contract?** The `packages/contracts/openapi.json` is the source of truth for the API surface. Frontend TypeScript types are generated from it. Backend schemas define it via FastAPI/Pydantic.

**Temperature = 0.0.** RAG needs deterministic, fact-grounded answers. Higher temperatures produce hallucinated or generic responses that ignore the retrieved context.

## Prerequisites

- **Node.js** ≥ 18 + **pnpm** ≥ 9
- **Python** ≥ 3.13 + **uv** (package manager)
- **Docker** (for PostgreSQL) or a running PostgreSQL 16 instance with pgvector
- **Ollama** (optional, for local embeddings + chat) with `mxbai-embed-large` and your chat model pulled

## Quick start

### 1. Start PostgreSQL

```bash
docker-compose up -d
```

This starts PostgreSQL 16 with pgvector on port **5432**.

### 2. Set up the API

```bash
cd apps/api
cp .env.example .env       # Edit if needed
uv sync                    # Install Python dependencies
uv run alembic upgrade head # Run migrations
uv run uvicorn app.main:app --reload  # Start API on :8000
```

The API is now at `http://localhost:8000`. Open `http://localhost:8000/docs` for the Swagger UI.

### 3. Install frontend dependencies

```bash
pnpm install   # From the repo root; installs all workspace packages
```

### 4. Start the admin dashboard

```bash
pnpm dev:admin   # → http://localhost:3000
```

Use the admin to:

- Create a project
- Upload documents (PDFs)
- Click **Ingest** on each document to index it
- Add FAQs
- Configure the LLM provider/model in the **Settings** tab

### 5. Start the public Q&A app

```bash
pnpm dev:public   # → http://localhost:5173
```

Select a project from the dropdown, browse its FAQs on the left, and ask questions in the chat on the right.

### All at once

```bash
# Terminal 1 — PostgreSQL
docker-compose up -d

# Terminal 2 — API
cd apps/api && uv run uvicorn app.main:app --reload

# Terminal 3 — Admin + Public
pnpm dev:admin & pnpm dev:public
```

## Environment variables (API)

| Variable               | Default                                                                          | Description                                    |
| ---------------------- | -------------------------------------------------------------------------------- | ---------------------------------------------- |
| `APP_ENV`              | `development`                                                                    | Environment (`development` / `production`)     |
| `ADMIN_API_TOKEN`      | `dev-admin-token`                                                                | Bearer token for admin endpoints               |
| `DATABASE_URL`         | `postgresql+psycopg://multiproject:multiproject@localhost:5432/multiproject_rag` | PostgreSQL connection string                   |
| `CORS_ORIGINS`         | `http://localhost:5173,http://localhost:3000`                                    | Allowed CORS origins (comma-separated)         |
| `STORAGE_DIR`          | `storage`                                                                        | Uploaded file storage directory                |
| `OLLAMA_BASE_URL`      | `http://localhost:11434`                                                         | Ollama server URL                              |
| `EMBEDDING_MODEL`      | `mxbai-embed-large`                                                              | Ollama model for embeddings                    |
| `CHAT_MODEL`           | `llama3.1:8b`                                                                    | Default chat model (when no per-project model) |
| `LLM_TEMPERATURE`      | `0.0`                                                                            | LLM temperature for all providers              |
| `MAX_UPLOAD_SIZE_MB`   | `20`                                                                             | Max file upload size                           |
| `MAX_RETRIEVAL_CHUNKS` | `8`                                                                              | Max chunks retrieved per query                 |

## API endpoints

### Public (no auth)

| Method | Path                             | Description                         |
| ------ | -------------------------------- | ----------------------------------- |
| `GET`  | `/api/projects`                  | List all projects                   |
| `GET`  | `/api/projects/{id}`             | Get project details                 |
| `GET`  | `/api/projects/{id}/faqs`        | List FAQs for a project             |
| `POST` | `/api/projects/{id}/chat`        | Chat with a project (non-streaming) |
| `POST` | `/api/projects/{id}/chat/stream` | Chat with a project (SSE streaming) |

### Admin (Bearer token)

| Method   | Path                                       | Description                     |
| -------- | ------------------------------------------ | ------------------------------- |
| `POST`   | `/api/projects`                            | Create project                  |
| `PATCH`  | `/api/projects/{id}`                       | Update project                  |
| `DELETE` | `/api/projects/{id}`                       | Delete project                  |
| `POST`   | `/api/projects/{id}/documents`             | Upload document                 |
| `GET`    | `/api/projects/{id}/documents`             | List documents                  |
| `POST`   | `/api/projects/{id}/documents/{id}/ingest` | Ingest document (chunk + embed) |
| `DELETE` | `/api/projects/{id}/documents/{id}`        | Delete document                 |
| `POST`   | `/api/projects/{id}/faqs`                  | Create FAQ                      |
| `PATCH`  | `/api/projects/{id}/faqs/{id}`             | Update FAQ                      |
| `DELETE` | `/api/projects/{id}/faqs/{id}`             | Delete FAQ                      |
| `GET`    | `/health`                                  | Health check (DB + Ollama)      |

## Adding a new LLM provider

1. Add the provider to `PROVIDER_BASE_URLS` in `apps/api/app/core/llm.py`
2. If the provider uses a non-OpenAI-compatible API, add a dedicated `_chat_<provider>()` function
3. Add the provider to the selects in both admin forms (create + settings)
4. Update the README table above
