# HiVE — Document Intelligence & Agentic Runtime Platform

HiVE is a full-stack document intelligence and agentic runtime platform featuring structure-aware document parsing, hybrid search (BM25 + Dense Vector Indexing), Reciprocal Rank Fusion (RRF), cross-encoder re-ranking, and autonomous ReAct agent loops. The entire system is containerized and runs with a single `docker compose up`.

---

## How to Run Locally

### Prerequisites

- **Docker** and **Docker Compose** (recommended)
- Or: **Python 3.12+**, **Node.js 22+**, **PostgreSQL 15+** for manual setup
- An **NVIDIA NIM API key** (free tier: [build.nvidia.com](https://build.nvidia.com))

### Docker Compose

```bash
git clone <repo-url> && cd quickdesk

# Configure your API key
cp backend/.env.example backend/.env
# Edit backend/.env and set NVIDIA_API_KEY=nvapi-...

docker compose up --build -d
```

Open **http://localhost:5173**. The Vite dev server proxies `/api/*` and `/ws/*` to the backend.

### Seed Accounts

| Role | Email | Password |
|------|-------|----------|
| Employee | `employee@quickdesk.com` | `password123` |
| Agent | `agent@quickdesk.com` | `password123` |
| Superadmin | `admin@quickdesk.com` | `password123` |

---

## API Endpoints

### Authentication

| Method | Path | Purpose | Auth |
|--------|------|---------|------|
| `POST` | `/api/auth/register` | Register new user (always employee role) | No |
| `POST` | `/api/auth/login` | Login, returns JWT access token | No |
| `GET` | `/api/auth/me` | Get current user profile | Bearer |
| `GET` | `/api/auth/users` | List all users | Superadmin |
| `POST` | `/api/auth/users` | Create user with custom role | Superadmin |
| `PATCH` | `/api/auth/users/{id}` | Update user details/role | Superadmin |

### Tickets

| Method | Path | Purpose | Auth |
|--------|------|---------|------|
| `POST` | `/api/tickets` | Create ticket (queues AI classification in background) | Bearer |
| `GET` | `/api/tickets` | List tickets (employee: own only; agent/admin: all) | Bearer |
| `PATCH` | `/api/tickets/{id}` | Update category/priority/status (audit logged) | Agent, Superadmin |
| `POST` | `/api/tickets/{id}/reply` | Submit final resolution, marks ticket resolved | Agent, Superadmin |
| `GET` | `/api/tickets/{id}/audit-logs` | Get override audit history for a ticket | Bearer |

### Metrics & Real-time

| Method | Path | Purpose | Auth |
|--------|------|---------|------|
| `GET` | `/api/metrics` | Dashboard analytics (status counts, categories, median resolution, override %) | Agent, Superadmin |
| `WS` | `/ws/tickets` | Real-time ticket event stream (created, updated, resolved) | None (open) |
| `GET` | `/api/health` | Health check | None |

---


# Decisions and Tradeoffs

## a) Why React (Vite) instead of Next.js?

I chose React with Vite because QuickDesk is an internal single-page application. It doesn't require server-side rendering or SEO, so Vite provides a simpler setup, faster development experience, and a lightweight production build.

---

## b) RAG Pipeline

The knowledge base consists of markdown documents loaded using LangChain. The documents are split into smaller chunks using `RecursiveCharacterTextSplitter`, embedded using NVIDIA embeddings, and stored in a Chroma vector database.

When an agent opens a ticket, the system retrieves the most relevant knowledge base chunks using semantic search and passes them to the LLM along with the ticket details to generate a draft response. If no relevant documents are found, the assistant returns a fallback response instead of generating unsupported information.

---

## c) Invalid LLM Categories

The LLM output is validated against the allowed category and priority values. If an invalid value is returned or parsing fails, the backend falls back to safe default values (`Other` and `Medium`) before storing the ticket.

---

## d) JWT Storage

The JWT is stored in localStorage for simplicity since this project is a client-side SPA. In a production environment, I would prefer using secure httpOnly cookies to reduce XSS exposure.

---

## e) Backend Role Enforcement

Role-based access is enforced on the backend using FastAPI dependencies. Protected endpoints verify the authenticated user's role before executing any business logic, preventing unauthorized users from accessing agent-only functionality even if they manually call the API.

---

## f) Why WebSockets?

I used native WebSockets because the application only needs lightweight real-time updates for ticket creation and resolution. If a connection is lost, the client reconnects and refreshes the latest data.

---

## g) Biggest Limitation

The biggest limitation is the dependency on the external LLM provider. If the AI service is unavailable, ticket creation still succeeds but AI classification and draft generation will not be available until the service is restored. In a production system, I would introduce retries and background job processing.

---

## h) AI Assistance

AI tools helped accelerate repetitive tasks such as project scaffolding, boilerplate code, and UI development. However, generated code and prompts still required manual review and refinement to ensure they met the project requirements.

---

# What I Would Do With More Time

* Add authenticated WebSocket connections.
* Improve AI background worker with better retry handling.
* Add file uploads for attachments.
* Improve automated test coverage.
* Replace localStorage authentication with secure cookies.

---

# Known Limitations

* WebSocket connections are not authenticated.
* AI processing depends on an external LLM service.
* No rate limiting implemented for auth or other endpoints.
* Ticket pagination is handled on the client.

---

# Tech Stack

| Layer          | Technology                    |
| -------------- | ----------------------------- |
| Frontend       | React, Vite                   |
| Backend        | Python, FastAPI           |
| Database       | PostgreSQL                    |
| AI             | LangChain, NVIDIA NIM, Chroma |
| Authentication | JWT, bcrypt                   |
| Real-time      | Native WebSockets             |
| Infrastructure | Docker Compose                |

---

## Architecture Diagram

                    QuickDesk Architecture

                    +----------------------+
                    |    React (Vite)      |
                    |   Employee / Agent   |
                    +----------+-----------+
                               |
                         REST API + JWT
                               |
                               ▼
                  +---------------------------+
                  |       FastAPI Backend     |
                  |---------------------------|
                  | • Authentication          |
                  | • Ticket Management       |
                  | • AI Classification       |
                  | • RAG Service             |
                  | • Metrics                 |
                  | • WebSocket Server        |
                  +------+-------------+------+
                         |             |
               SQLModel  |             | LangChain
                         |             |
                         ▼             ▼
             +----------------+   +----------------+
             |   PostgreSQL   |   | Chroma Vector  |
             |                |   |     Store      |
             +----------------+   +--------+-------+
                                           |
                                   Embeddings/Search
                                           |
                                           ▼
                              +-------------------------+
                              | NVIDIA NIM / LLM API    |
                              | - Embeddings            |
                              | - Category & Priority   |
                              | - Draft Reply           |
                              +-------------------------+
