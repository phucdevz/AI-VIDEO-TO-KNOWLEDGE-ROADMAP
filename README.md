# AI Video-to-Knowledge Roadmap

> **Turn every lecture into a navigable knowledge graph with Deep Time-linking.**

A full-stack system that ingests lecture video, extracts structured knowledge, and serves it through a time-synchronized UI: interactive mindmaps (React Flow), quizzes, an AI tutor grounded in the transcript, and real-time analytics.

---

## Key features

- **Audio extraction** — Download and isolate audio from supported video URLs (via `yt-dlp` and FFmpeg-backed tooling).
- **Multi-provider transcription** — Groq Whisper and Google Gemini paths for speech-to-text with segment timestamps.
- **AI-powered mindmap** — LLM-generated graph data rendered as an interactive **React Flow** diagram with **Deep Time-linking** (nodes seek the player to the relevant passage).
- **Smart quiz & tutor** — Structured quiz payloads and a tutor that answers from retrieved transcript segments (RAG-style grounding with citations).
- **Real-time analytics** — Dashboards fed by Supabase **Realtime** where configured.

---

## Technical stack

| Layer | Technologies |
|--------|----------------|
| **Frontend** | React 19, Vite, TypeScript, Tailwind CSS, Zustand, React Flow (`@xyflow/react`), Lucide React |
| **Backend** | FastAPI, Python 3.12, `yt-dlp`, Groq SDK, Google Generative AI (Gemini), Uvicorn |
| **Models (typical)** | Groq Whisper (transcription), **Gemini 1.5 Flash** (structured JSON / reasoning), **Llama 3.3** (or equivalent) when routed via Groq for LLM tasks |
| **Database & auth** | Supabase — PostgreSQL, Realtime subscriptions, OAuth / JWT (`@supabase/supabase-js`) |
| **Shared UI tokens** | `@ether/design-tokens` (monorepo package) |

---

## System architecture

### End-to-end AI pipeline

The processing path is linear and artifact-driven:

```text
Video URL  →  Audio (temp storage)  →  Transcription (timestamped segments)
       →  LLM reasoning  →  Structured JSON (mindmap, quiz, tutor metadata)
       →  Supabase persistence  →  Frontend (player + graph + quiz + tutor)
```

1. **Ingest** — The backend resolves the URL, extracts audio, and stores intermediate files under a configurable temp directory.
2. **Transcription** — Segments carry **start/end times**, which power Deep Time-linking in the UI.
3. **Structured generation** — The LLM emits JSON aligned to the app contract (e.g. React Flow graph, quiz bank, tutor summary and key points).
4. **Persistence** — Rows in Supabase hold transcript, `flow_data`, `quiz`, `summary`, and `tutor_data` for replay and analytics.
5. **Delivery** — The SPA loads lecture state, subscribes to Realtime where used, and binds the video player to graph nodes and tutor citations.

### RAG for tutor and quiz

- **AI Tutor** — User questions are answered using **retrieval-augmented** context: relevant **transcript segments** (optionally after semantic chunking) are passed to the model so replies stay **grounded** and can expose **click-to-seek** citations.
- **Quiz generation** — Quizzes are produced from the same lecture-aligned text and structured schema, reducing reliance on unrelated prior knowledge.

This is not a generic chat overlay: retrieval scope is the current lecture’s transcript (and stored pipeline outputs), not the open web.

---

## Installation and setup

### Prerequisites

- **Node.js** 18+ and **npm** (workspaces).
- **Python** 3.12+ and **pip**.
- **FFmpeg** (required for audio extraction/processing in the pipeline).

### Backend (`backend/`)

```bash
cd backend
python -m venv venv
# Windows:
venv\Scripts\activate
# macOS / Linux:
# source venv/bin/activate

pip install -r requirements.txt
```

Create `backend/.env` (see [Environment variables](#environment-variables)). Then:

```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

API docs: `http://127.0.0.1:8000/docs` · Health: `GET /api/v1/health`

### Frontend (`apps/web/`)

From the **repository root** (npm workspaces):

```bash
npm install
npm run dev
```

This runs the Vite dev server for the `web` workspace (default: `http://localhost:5173`).

Create `apps/web/.env` as below. Routes commonly used: `/login`, `/workspace`, `/roadmap`, `/quiz`, `/analytics` (see app routing).

### Monorepo layout

| Path | Role |
|------|------|
| `backend/` | FastAPI API and pipeline |
| `apps/web/` | Vite + React SPA |
| `packages/design-tokens/` | Ether design tokens and Tailwind preset |

---

## Environment variables

Use placeholders only in committed examples; never commit secrets.

### Backend — `backend/.env`

| Variable | Description |
|----------|-------------|
| `API_HOST` | Bind address (e.g. `0.0.0.0`) |
| `API_PORT` | Port (e.g. `8000`) |
| `TEMP_AUDIO_DIR` | Directory for temporary audio files |
| `CORS_ORIGINS` | Comma-separated allowed origins for the SPA |
| `GROQ_API_KEY` | Groq API key (Whisper / LLM) |
| `GOOGLE_API_KEY` | Google AI (Gemini) API key |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_KEY` | Supabase service or anon key (as required by your deployment) |
| `AI_PROVIDER` | `auto`, `groq`, or `google` — selects or prioritizes providers |

Reference copies: `backend/.env.example`

### Frontend — `apps/web/.env`

| Variable | Description |
|----------|-------------|
| `VITE_API_URL` | Base URL of the FastAPI backend |
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon (public) JWT |
| `VITE_SITE_URL` | Optional canonical origin for SEO |

If Supabase variables are unset, the app may run with reduced auth / mock library behavior per implementation.

Reference copy: `apps/web/.env.example`

---

## Accuracy and evaluation

We characterize pipeline quality with metrics that separate **speech recognition**, **semantic alignment**, and **structured extraction**:

| Metric | What it measures | Role in this project |
|--------|------------------|----------------------|
| **WER (Word Error Rate)** | Edit distance between hypothesis and reference transcript at the word level | Quantifies **transcription** quality across providers and languages; lower is better. |
| **Cosine similarity** | Cosine distance between embeddings of retrieved chunks and the user query (or reference span) | Evaluates **retrieval** for tutor and chunk selection—whether the right parts of the lecture are surfaced before generation. |
| **F1-score** | Harmonic mean of precision and recall on labeled spans or quiz/triple labels | Measures **end-to-end structured output** (e.g. correct concepts, answers, or tagged segments) against a gold set. |

Together, these metrics support regression testing when swapping models, tuning chunk sizes, or changing prompts—without relying on subjective spot checks alone.

---

## Design system: Ether

The UI follows the **Ether** language: **glassmorphism** (frosted surfaces, controlled transparency, backdrop blur), **tonal layering** instead of heavy outlines, and an **electric violet** accent for primary actions. Principles include the **no-line rule** (separation by surface color, not arbitrary borders), **ambient** shadows, and **editorial** typography (Inter, strong scale contrast). Implementation lives in `packages/design-tokens` and shared utilities in `apps/web/src/index.css`; extended guidance: `apps/web/docs/design.md`.

---

## Future roadmap

- **Multi-video knowledge synthesis** — Merge insights across lectures or courses into unified graphs and review flows.
- **Collaborative workspaces** — Shared libraries, annotations, and synchronized sessions on top of Supabase Realtime and row-level access patterns.

---

## License

See repository license file (e.g. MIT) if present.
