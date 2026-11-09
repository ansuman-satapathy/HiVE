# HiVE

A self-hosted document intelligence workspace I built to fix a problem I kept running into with standard RAG implementations: they fail on exact keywords (error codes, function names, API identifiers), and they give you no visibility into *why* a particular chunk was retrieved.

HiVE is my attempt to build the retrieval pipeline I actually wanted — hybrid BM25 + dense vector search, Reciprocal Rank Fusion, cross-encoder reranking, context window expansion, and a Retrieval Studio where you can benchmark any query and see every intermediate score. The chat interface puts a conversational layer on top of that pipeline with an agent that searches first and streams cited answers token by token.

---

## What It Does

Upload a PDF, Markdown file, plain text, CSV, or Excel sheet. Ask a question. Get a streaming answer with every factual claim linked back to the exact retrieved excerpt — click any citation badge to inspect the source chunk, its relevance score, and its section heading.

The Retrieval Studio lets you run any query in debug mode and see the BM25 sparse score, dense cosine similarity, RRF fusion rank, and cross-encoder rerank score for each candidate — side by side.

---

## Retrieval Pipeline

Standard vector search retrieves semantically similar text well but misses exact terms — an error code like `ERR_AUTH_401` gets embedded into a neighbourhood of "authentication errors" rather than matching the literal string. BM25 catches exact identifiers but misses paraphrase. Neither alone is sufficient.

HiVE runs both in parallel and fuses them:

```
Query
  ├── BM25 sparse search    (rank_bm25, BM25Plus, in-memory)
  └── Dense vector search   (ChromaDB, NVIDIA NIM text-embedding-3 or local fallback)
            │
            ▼
    Reciprocal Rank Fusion  (k=60, rank-based — avoids score-scale incompatibility)
            │
            ▼
    Cross-encoder rerank    (NVIDIA rerank-3 or local heuristic: exact phrase + proximity + coverage)
            │
            ▼
    Context window expansion (fetch ±N surrounding chunks, deduplicate overlap)
            │
            ▼
    LLM synthesis + streaming citations
```

**RRF design note:** BM25 scores are dimensionless (12.3, 0.8, ...) and cosine similarities are bounded [-1, 1]. Averaging them is meaningless. RRF converts both to ordinal ranks and sums `1 / (k + rank)` — a document that places first in both systems gets the highest fused score regardless of raw score scale.

**Cross-encoder note:** The bi-encoders used for vector search embed query and document *separately* — fast for ANN lookup but they can't model token interactions. A cross-encoder receives `[query, document]` as a joint input and can score "database timeout" as a compound phrase, not two independent tokens.

---

## Chunking

The chunking service is structure-aware rather than fixed-character. It detects markdown heading levels (`#`, `##`, `###`) and PDF page markers, groups content under its nearest heading, and embeds `active_heading` and `section_hierarchy` into each chunk's metadata. That section context is what surfaces in the citation drawer when you click a source badge.

Fixed-character splitting is simpler but it cuts mid-sentence and severs tables from their column headers. Structure-aware chunking keeps semantically related content together and produces chunks that are actually coherent in isolation.

---

## Agent

The agent uses a simplified ReAct pattern — Thought → Action → Observation. For conversational messages (greetings, follow-ups) it short-circuits directly to the LLM, skipping retrieval. For substantive questions it always searches first, without an extra LLM call to decide *whether* to search.

The reasoning timeline in the UI shows every step the agent took — what it searched for, how many chunks it retrieved, and from which documents — so the answer isn't a black box.

---

## Architecture

```
Browser
  │
  ├── REST API (FastAPI, JWT auth)
  ├── SSE stream (chat completions, token-by-token)
  └── WebSocket (ingestion progress updates)
           │
           ▼
    FastAPI Backend
      ├── Document ingestion worker (async, background tasks)
      ├── Hybrid retrieval engine   (BM25 + ChromaDB + RRF + reranker)
      ├── Context expansion         (±N chunk window, overlap dedup)
      ├── Agent runtime             (ReAct, tool dispatcher, CRAG)
      └── LLM service               (NVIDIA NIM / local fallback, provider abstraction)
           │
      ┌────┴─────┐
      │          │
 PostgreSQL    ChromaDB
 (documents,   (dense vector
  chunks,       embeddings)
  sessions)
```

---

## Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| Backend | FastAPI + SQLModel | Async-native, type-safe ORM, easy SSE via `StreamingResponse` |
| Database | PostgreSQL 15 | Document & chunk metadata, sessions, retrieval profiles |
| Vector store | ChromaDB | Persistent, embedded, no separate server required |
| Sparse search | `rank_bm25` (BM25Plus) | In-memory, thread-safe, superior to BM25 on short docs |
| Reranker | NVIDIA NIM `rerank-3` / local heuristic | Full cross-encoder when API key present, deterministic fallback otherwise |
| Embeddings | NVIDIA NIM `text-embedding-3` / local fallback | Same provider abstraction — works offline |
| LLM | NVIDIA NIM `meta/llama-3.1-70b-instruct` | Swappable via config |
| Frontend | React 18 + Vite + Tailwind | SPA, no SSR needed for a single-workspace tool |
| Auth | JWT (bcrypt, `python-jose`) | Stateless, simple for single-tenant workspace |
| Containerisation | Docker Compose | Single command to run the full stack |

---

## Running Locally

**Prerequisites:** Docker + Docker Compose. An NVIDIA NIM API key (free tier at [build.nvidia.com](https://build.nvidia.com)). The pipeline also runs fully offline with local fallbacks — no API key required for development.

```bash
git clone <repo> && cd quickdesk

cp backend/.env.example backend/.env
# Set NVIDIA_API_KEY=nvapi-... in backend/.env (optional — works without it)

docker compose up --build -d
```

Open **http://localhost:5173**

Default workspace account: `admin@quickdesk.com` / `password123`

### Updating Frontend Files in Docker
The backend runs with a volume mount (`--reload`), so Python changes take effect immediately. For the production frontend container (which serves the compiled bundle via Nginx), rebuild and recreate only the frontend container without resetting PostgreSQL or the backend:

```bash
# One-liner to recompile frontend and restart its container:
docker compose up -d --build frontend
```

### Viewing Container Logs

Stream live logs from individual services or the entire stack:

```bash
# Stream backend API logs (FastAPI, vector search, agent loops):
docker compose logs -f backend

# Stream frontend logs (Nginx HTTP access & proxy events):
docker compose logs -f frontend

# Stream all service logs simultaneously:
docker compose logs -f
```

### Quick Commands (Makefile)
A root `Makefile` is included with standard shortcuts:

| Command | Action |
|---------|--------|
| `make logs-backend` | Stream live backend FastAPI logs |
| `make logs-frontend` | Stream live frontend Nginx logs |
| `make logs` | Stream logs from all containers |
| `make build-frontend` | Rebuild frontend and restart its container |
| `make test` | Run backend test suite |
| `make up` / `make down` | Start or stop the Docker stack |

---

## API Surface

### Documents
| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/documents/upload` | Upload file, starts async ingestion pipeline |
| `GET`  | `/api/documents/` | List all documents with ingestion status |
| `GET`  | `/api/documents/{id}/chunks` | Fetch all chunks with metadata for a document |
| `DELETE` | `/api/documents/{id}` | Delete document and purge from BM25 + vector indices |

### Chat
| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/chat/sessions` | Create a new chat session |
| `GET`  | `/api/chat/sessions` | List sessions |
| `POST` | `/api/chat/sessions/{id}/stream` | SSE stream — returns `thought`, `tool_call`, `tool_result`, `token`, `done` events |

### Retrieval (Debug)
| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/retrieval/debug` | Run a query through the full pipeline, return per-stage scores |
| `GET`  | `/api/retrieval/profiles` | List retrieval profiles |
| `POST` | `/api/retrieval/profiles` | Create a custom retrieval profile |

### Auth
| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/auth/login` | Returns JWT |
| `GET`  | `/api/auth/me` | Current user |

---

## Tests

```bash
cd backend && source .venv/bin/activate
pytest tests/ -v
```

37 tests covering BM25 tokenization and recall, RRF formula correctness, cross-encoder ordering, context expansion overlap deduplication, document upload pipeline, chat SSE API, and agent tool dispatch. All tests run with no API key and no network — every AI service has a local deterministic fallback.

```
tests/test_bm25_search.py          — tokenizer preserves error codes, BM25 scores rank correctly
tests/test_hybrid_retrieval.py     — RRF formula verification with known ranks
tests/test_cross_encoder_reranker.py — exact phrase boost, proximity scoring
tests/test_context_expansion.py   — overlap deduplication, window boundary handling
tests/test_document_upload.py     — parse → chunk → index pipeline
tests/test_chat_stream_api.py     — SSE frame parsing, citation embedding
tests/test_react_agent.py         — tool dispatch, conversational short-circuit
```

---

## Retrieval Studio

The `/retrieval` route in the UI is a debug playground. Enter any query, pick a document scope (all or specific), and click **Run Pipeline**. The results panel shows:

- BM25 score and rank per candidate chunk
- Dense cosine similarity and rank per candidate chunk  
- RRF fusion score
- Cross-encoder rerank score
- Final context text sent to the LLM
- Total retrieval latency

This was the main reason I built HiVE — I wanted to see exactly why the wrong chunk was being retrieved, not just that the answer was wrong.

---

## Roadmap

Things I'd add with more time, roughly in priority order:

- **Corrective RAG (CRAG):** Grade retrieved context relevance after retrieval. If the best chunk scores below a threshold, rewrite the query and retrieve again before synthesising. Already partially designed in `agent_runtime.py`.
- **MCP server endpoint:** Expose the document search tool over the [Model Context Protocol](https://modelcontextprotocol.io) so Claude Desktop or Cursor can query indexed documents directly.
- **Eval harness:** A CLI script (`evals/run_eval.py`) that runs benchmark questions through the retrieval pipeline and scores Faithfulness and Answer Relevancy (Ragas / DeepEval).
- **Sandboxed Python execution:** Let the agent write and run Python to answer quantitative questions over CSV/Excel data.
- **Structured audit log:** Persist every document mutation and agent tool call with correlation IDs for debugging.

---

## Known Limitations

- The BM25 index is in-memory — it rebuilds from PostgreSQL on startup, which adds ~2–5 seconds for large corpora. A persisted Postgres FTS index would eliminate this.
- WebSocket connections for ingestion progress are not authenticated.
- No rate limiting on the chat endpoint.
- The local embedding fallback uses a heuristic character n-gram approach — retrieval quality is significantly better with real embeddings.
