# PROGRESS.md — Bàn giao kỹ thuật (Handover Note)

**Dự án:** AI Video-to-Knowledge Roadmap  
**Mục đích tài liệu:** Cho phép Architect / AI tiếp theo (ví dụ Gemini) nắm trạng thái repo, stack, design system, việc đã xong / chưa xong, và nợ kỹ thuật — **không cần đoán**.

**Cập nhật:** Theo trạng thái codebase tại thời điểm bàn giao (monorepo: `apps/web` + `packages/*` + `backend/`).

---

## 1. Current Architecture

### 1.1 Tổng quan monorepo (thư mục gốc)

| Path | Vai trò |
|------|---------|
| `package.json` | NPM **workspaces**: `apps/*`, `packages/*`. Script `npm run dev` / `build` mặc định chạy workspace `web`. |
| `apps/web/` | **Frontend** chính: React 19 + Vite 5 + TypeScript + Tailwind 3. |
| `packages/design-tokens/` | Package `@ether/design-tokens`: **Tailwind preset** (palette “Ether” cũ — xem Technical Debt). |
| `backend/` | **Backend** FastAPI: trích xuất audio YouTube qua `yt-dlp`. |
| `README.md`, `Project_Structure.md` | Tài liệu tổng quan dự án (một phần mô tả target chưa đồng bộ 100% với code). |

### 1.2 Frontend (`apps/web/`)

**Công nghệ đã cài (dependencies chính):**

- **Runtime UI:** `react`, `react-dom` (19.x)  
- **Build:** `vite` (~5.4), `@vitejs/plugin-react`, `typescript`  
- **Styling:** `tailwindcss`, `postcss`, `autoprefixer`, `@tailwindcss/forms`, preset `@ether/design-tokens`  
- **Routing:** `react-router-dom` (~7.x)  
- **Icons:** `lucide-react` (stroke chuẩn design system: **1.5**)  
- **HTTP:** `axios` — client gọi FastAPI (`src/lib/api.ts`)  
- **State (client):** `zustand` — `useWorkspaceStore` (Deep Time-Linking), `useAppStore` (prefs + library lectures), `useAuthStore` (Supabase session)  
- **Backend-as-a-Service:** `@supabase/supabase-js` — Auth, Realtime (`lectures`, `user_preferences`), CRUD `quiz_results`  
- **Video:** `react-player` — YouTube / URL, `seekTo` cho time-linking  
- **Mindmap (render):** `mermaid` — dynamic import trong `MindmapPanel`  
- **Charts:** `recharts` — Radar trên `AnalyticsPage`; heatmap dựng bằng CSS grid + token `ds-*`

**Cấu trúc `src/` (rút gọn có ý nghĩa):**

```
apps/web/src/
├── App.tsx                 # Định tuyến toàn app
├── main.tsx                # React root + BrowserRouter
├── index.css               # Tailwind + utilities .ds-* + legacy .ether-* (xem Debt)
├── vite-env.d.ts           # `ImportMetaEnv` (VITE_API_URL)
├── lib/
│   ├── api.ts              # axios instance, baseURL, postAudioExtraction()
│   └── stack.ts            # Ghi chú lựa chọn stack (video/mermaid/recharts/zustand)
├── stores/
│   ├── useWorkspaceStore.ts
│   └── useAppStore.ts
├── components/
│   ├── layout/             # Layout shell: MainSidebar, AppHeader, Layout (+ Outlet)
│   └── workspace/          # WorkspaceVideoPanel, MindmapPanel, TutorSidebar
└── pages/
    ├── AuthPage.tsx
    ├── DashboardPage.tsx   # “Library” + New Analysis zone (placeholder pipeline)
    ├── WorkspacePage.tsx   # 3 cột: video | mindmap | tutor/summary
    ├── QuizCenterPage.tsx
    ├── AnalyticsPage.tsx
    ├── SettingsPage.tsx
    └── index.ts
```

**Routing hiện tại (`App.tsx`):**

- `/login` — full-page auth (Supabase email/password khi có env).  
- `RequireAuth` → `Layout` → `/` redirect `/dashboard`, `/dashboard`, `/workspace`, `/quiz`, `/analytics`, `/settings` (nếu không cấu hình Supabase FE, `RequireAuth` bỏ qua gate và render `Outlet` để dev).  
- `/roadmap` → redirect `/dashboard` (tương thích link cũ).

**Biến môi trường frontend:** `apps/web/.env.example` — `VITE_API_URL` (mặc định trong code: `http://127.0.0.1:8000` nếu không set).

### 1.3 Backend (`backend/`)

**Công nghệ:**

- `fastapi`, `uvicorn[standard]`  
- `pydantic`, `pydantic-settings`, `python-dotenv`  
- `yt-dlp` — tải **best audio** từ URL (YouTube / site hỗ trợ)

**Cấu trúc:**

```
backend/
├── requirements.txt
├── .env.example            # API_HOST, API_PORT, TEMP_AUDIO_DIR + placeholder AI/Supabase
├── app/
│   ├── main.py             # FastAPI app, CORS, mount api_router
│   ├── config.py           # Settings (temp_audio_dir, cors_origins, …)
│   ├── api/
│   │   ├── deps.py
│   │   └── routes/
│   │       ├── health.py   # GET /api/v1/health
│   │       └── extraction.py  # POST /api/v1/extraction/audio
│   ├── schemas/extraction.py
│   └── services/audio_extraction.py
└── storage/temp/audio      # Tạo khi chạy (gitignore)
```

**Endpoint đã có:**

- `GET /` — metadata ngắn  
- `GET /api/v1/health`  
- `POST /api/v1/extraction/audio` — body `{ "url": "<http-url>" }` → trả metadata + `audio_path` (đường dẫn tuyệt đối trên server)

**Chạy backend (chuẩn):** từ thư mục `backend/`, `uvicorn app.main:app --reload` (để relative path `TEMP_AUDIO_DIR` đúng).

### 1.4 Package `packages/design-tokens/`

- Export Tailwind preset **màu “Ether”** (tông sáng / violet cũ) — vẫn được **merge** qua `presets` trong `apps/web/tailwind.config.cjs`.  
- **Design system UI hiện tại** ưu tiên prefix **`ds-*`** (dark navy glass) — xem mục 2.

---

## 2. Design System (Glassmorphism — đang áp dụng cho UI mới)

**Nguyên tắc:** Deep Navy nền, Electric Violet primary, Cyan accent, glass surface, lưới **8px**, bo góc **8px / 16px**, transition **200ms ease-in-out**, icon **Lucide** stroke **1.5**.

### 2.1 Màu (Tailwind `theme.extend.colors.ds`)

| Token | Giá trị | Dùng cho |
|-------|---------|----------|
| `ds-primary` | `#7c4dff` | CTA, active nav, radar stroke/fill chính |
| `ds-secondary` | `#00e5ff` | Accent, success/highlight, focus ring phụ |
| `ds-bg` | `#0a192f` | Nền trang chính |
| `ds-text-primary` | `#e6f1ff` | Tiêu đề, text chính |
| `ds-text-secondary` | `#8892b0` | Mô tả, label phụ |
| `ds-border` | `rgba(136, 146, 176, 0.2)` | Viền tinh tế |

### 2.2 Glass surface (CSS class)

- **Class:** `.ds-surface-glass` trong `apps/web/src/index.css`  
- **Nền:** `rgba(16, 30, 56, 0.6)`  
- **Blur:** `backdrop-filter: blur(10px)` (+ `-webkit-`)

### 2.3 Typography & layout

- **Font:** **Inter** — load qua Google Fonts trong `apps/web/index.html`; Tailwind `font-body` từ preset legacy + `text-ds-base` (**16px**, line-height **1.5**).  
- **Container tối đa:** `max-w-ds` = **1440px** (centered do từng page tự `mx-auto`).  
- **Bo góc:** `rounded-ds-sm` = **8px**, `rounded-ds-lg` = **16px**.  
- **Đổ bóng:** `shadow-ds-soft` = `0 4px 30px rgba(0, 0, 0, 0.1)`.  
- **Transition:** utility `.ds-transition` = `all 0.2s ease-in-out`.

### 2.4 Ghi chú nhất quán

- Tránh trộn **preset cũ** (`primary`, `surface`, … từ `@ether/design-tokens`) với màn **ds-dark** nếu không chủ đích; roadmap là **dần thống nhất `ds-*`** trên các page mới.

---

## 3. Completed Tasks (Đã code xong)

### Frontend

- [x] Monorepo + workspace `web`, build Vite 5 (đã pin để tương thích Node 20.12).  
- [x] **Layout:** `Layout` + `MainSidebar` + `AppHeader` + `Outlet`.  
- [x] **React Router** đầy đủ sitemap: Auth, Dashboard, Workspace, Quiz, Analytics, Settings.  
- [x] **Dashboard (Library):** grid mock lectures, search/filter UI, vùng “New Analysis” (chưa gọi API thật).  
- [x] **Workspace:** 3 cột — `react-player`, `MindmapPanel` (Mermaid dynamic import + nút **Deep time-links** demo), `TutorSidebar` placeholder.  
- [x] **Zustand `useWorkspaceStore`:** `requestSeek` / `clearSeekRequest` nối mindmap → video seek (logic demo).  
- [x] **QuizCenter:** chọn bài từ `lectures`, parse `quiz_data.questions`, state **pick → quiz → score**, lưu `quiz_results`.  
- [x] **Analytics:** thống kê thực từ Supabase — số bài, điểm quiz TB (%), ước lượng giờ học từ `transcript.duration`.  
- [x] **Settings:** đồng bộ `user_preferences` (JSON: summary, quiz difficulty, theme, API keys) + Realtime; `ds-*` UI.  
- [x] **Auth:** Supabase Auth (email/password), `AuthPage` sign-in/sign-up, `RequireAuth` bọc `/dashboard`, `/workspace`, `/quiz`, `/analytics`, `/settings` khi có `VITE_SUPABASE_*` (thiếu env → bỏ qua gate để dev local).  
- [x] **Social Authentication:** OAuth (GitHub & Google) qua Supabase `signInWithOAuth` + redirect về `/dashboard`.  
- [x] **Session Management:** `persistSession/autoRefreshToken` + observer `onAuthStateChange` để đồng bộ session/user.  
- [x] **Axios** `src/lib/api.ts` + `postAudioExtraction(url, userId?)` khớp backend (`user_id` optional).

### Backend

- [x] FastAPI app, CORS, prefix `/api/v1`.  
- [x] Health check.  
- [x] **Audio extraction service** (`yt-dlp`, `bestaudio/best`, lưu file dưới `TEMP_AUDIO_DIR`).  
- [x] Route async `POST /extraction/audio` (thread pool), schema Pydantic.
- [x] **Groq Whisper API** — transcript + segment timestamps qua `verbose_json`.
- [x] **Gemini 1.5 Flash** — sinh `react_flow` (nodes/edges) + `quiz` + `tutor` JSON từ transcript.
- [x] **Pipeline integration** — `POST /api/v1/extraction/audio` trả đủ contract (`transcription`, `react_flow`, `quiz`, `tutor`) và persist vào Supabase `lectures` khi cấu hình sẵn.  
- [x] **Realtime-friendly persist** — sau bước extract, `upsert_processing_placeholder` (`status=processing`) để client nhận sự kiện Realtime sớm; sau AI thì upsert đầy đủ (`status=ready`). Retry bỏ `knowledge_chunks` nếu `PGRST204`.  
- [x] **Request `user_id`** — optional trên `POST /extraction/audio` để gắn lecture với `auth.users` (RLS / thư viện theo user).
- [x] **Multi-language support (VI/EN)** — Settings chọn ngôn ngữ, pipeline truyền `target_lang` xuống AI để tạo mindmap/summary theo ngôn ngữ.
- [x] **Admin UI** — Gradio mounted tại `/admin` cho cấu hình key + chạy pipeline test + reload `.env`.

### DevEx

- [x] `apps/web/.env.example`, `backend/.env.example`.  
- [x] `dev.bat` ở root (Windows) chạy `npm run dev` cho frontend.

---

## 4. Pending Tasks (Chưa xong / cần làm tiếp)

### Pipeline AI & dữ liệu (theo README dự án)

- [ ] **Celery / queue** (nếu theo kiến trúc README) — chưa có.

### Frontend

- [ ] **React Flow** (optional) — nếu cần chỉnh sửa graph tương tác thủ công (chưa trong repo).  
- [ ] **Quiz & Tutor**: hiện tutor/quiz vẫn còn phần nào mock; cần render từ payload pipeline đầy đủ.  
- [ ] **Quiz:** không có state câu hỏi thật, chấm điểm, hay đồng bộ backend.  
- [ ] **Analytics:** dữ liệu mock; cần API thật hoặc Supabase aggregates.  
- [x] **Auth thật** (Supabase Auth / JWT) — hỗ trợ email/password + OAuth, bảo vệ route bằng `RequireAuth` khi có env.  
- [ ] **API keys Settings:** chỉ UI; cần lưu an toàn (không commit, ideally backend proxy).  
- [ ] **i18n / a11y audit** — chưa có kế hoạch cụ thể.

### Backend

- [ ] **Không expose** đường dẫn file local trong production — cần object storage + signed URL.  
- [ ] Auth / rate limit / user scoping.
- [ ] **Supabase schema parity:** môi trường hiện tại thiếu cột `knowledge_chunks` trong `lectures` nên `upsert` đang lỗi `PGRST204`.

### Hạ tầng

- [ ] Docker compose (frontend + backend + DB) nếu team cần.  
- [ ] CI (lint, test, build).

---

## 5. Technical Debt / Notes (ưu tiên đọc)

1. **Hai hệ màu Tailwind:** preset `@ether/design-tokens` (Ether sáng) vẫn merge; UI mới dùng **`ds-*`**. Dễ lệch màu nếu copy class cũ (`bg-surface`, `primary-gradient`, …). Nên migrate dần hoặc gỡ preset khi không cần.  
2. **`index.css`:** còn utilities legacy (`.ether-gradient`, `.glass-panel`, …) và `.material-symbols-outlined` — **Material Symbols không còn dùng** sau refactor; có thể dọn để giảm nhầm lẫn.  
3. **Bundle size:** `mermaid` + `react-player` làm chunk lớn; cân nhắc `manualChunks`, lazy route, hoặc tách worker.  
4. **Node engine:** Vite 8+ yêu cầu Node mới hơn; repo đang dùng **Vite 5.4** cho tương thích Node ~20.12 — ghi chú cho môi trường CI/CD.  
5. **CORS:** backend `cors_origins` mặc định localhost:5173 — cập nhật khi deploy domain thật.  
6. **`.env`:** không commit; backend đọc `SUPABASE_*` + AI keys; frontend đọc `VITE_API_URL`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (`apps/web/.env.example`).  
7. **FFmpeg:** `yt-dlp` có thể cần FFmpeg trên PATH tùy format; ghi chú cho máy dev/CI.  
8. **Bảo mật:** `POST /extraction/audio` có thể bị lạm dụng tải file; cần auth, quota, và sanitize output path.  
9. **Workspace demo video:** URL YouTube cố định trong `WorkspaceVideoPanel` — thay bằng props/state từ pipeline.

---

## 6. Gợi ý thứ tự làm việc cho Architect tiếp theo

1. **Hợp đồng API** (OpenAPI): định nghĩa flow `extract → transcribe → generate → save` + model response (transcript segments, mermaid string, quiz JSON).  
2. **Backend:** implement transcribe (Groq) + Gemini + lưu Supabase; che bớt đường dẫn local.  
3. **Frontend:** kết nối Dashboard + Workspace với API thật; persist keys qua backend hoặc Supabase Edge.  
4. **Dọn design debt:** một nguồn token (chỉ `ds-*` hoặc document rõ khi nào dùng Ether preset).  
5. **Auth & protected routes** trước khi mở rộng user-generated content.

---

*Tài liệu này là “single source of truth” cho trạng thái implementation tại thời điểm bàn giao; cập nhật `PROGRESS.md` sau mỗi milestone lớn.*

---

## 7. Bug Fix Log (QA / Frontend hardening — 2026-03)

**Layout & responsive**

- `html` / `body`: `overflow-x: clip` chặn cuộn ngang trên mobile.
- `Layout`: `min-w-0`, `overflow-x-clip` trên cột chính; `main` có `min-w-0` để flex không tràn.
- `MainSidebar`: `z-[70]` trên mobile (trên overlay `z-40`) để hamburger drawer không bị che.
- `WorkspacePage` + `WorkspaceSkeleton`: `min-w-0` + `overflow-x-clip`.

**Interaction & design system (`ds-*`)**

- `.ds-interactive`, `.ds-interactive-icon`, `.ds-interactive-card`: thêm **hover `scale(1.02)`** và **active `scale(0.98)`** (đồng bộ yêu cầu QA); `prefers-reduced-motion` tắt scale.
- Dọn **utilities legacy** trong `index.css` (`.ether-gradient`, `.glass-panel`, … không còn dùng) → giữ `.ds-gradient-primary` dự phòng.
- **Tippy** mindmap: theme đổi tên **`ds-mindmap-tooltip`**; `zIndex` tooltip **360**.

**Z-index (modal / toast)**

- **Command Palette**: `z-[400]` / `z-[401]` (luôn trên chrome và fullscreen workspace).
- **EtherToaster** (`react-hot-toast`): `containerStyle.zIndex: 390`.

**Trang & component**

- **Dashboard**: tách ô URL pipeline vs ô tìm thư viện; **skeleton** grid khi tải; **empty state** (Lucide `Library`) khi filter rỗng; `line-clamp` tiêu đề / khóa học trên thẻ.
- **Workspace video**: `validateSeekSeconds` + **try/catch** quanh `seekTo`; guard `playedSeconds` NaN; clip loop chỉ seek khi start/end hợp lệ.
- **Mindmap**: **`MindmapErrorBoundary`** bọc `MindmapPanel` trên `WorkspacePage`.
- **Analytics**: `ResponsiveContainer` + `debounce={50}`; khối radar `min-w-0` / chiều cao responsive `min-h-[240px]`, `h-[min(360px,70vw)]`; mục gợi ý `line-clamp-2`.
- **Quiz**: tiêu đề câu hỏi `line-clamp-3`.
- **Command Palette**: tiêu đề bài giảng `line-clamp-2`, khóa học `line-clamp-1`.
- **TutorSidebar / Highlights**: empty state có icon **`BookmarkX`** + copy mô tả.

**Ghi chú**

- ESLint rule `react-hooks/set-state-in-effect` trên `WorkspaceVideoPanel`: `setPlaying` sau clip loop bọc **`queueMicrotask`** để tránh setState đồng bộ trong effect.
- Một số cảnh báo `react-refresh/only-export-components` (vd. `ShellContext`, `etherToast`) là **nợ đã có** — chưa refactor tách file trong pass này.
- Sửa lỗi BE pipeline: `AIService.generate_from_transcript()` bị gọi sai positional args trong `pipeline.py`; đã đổi sang keyword arg `video_title=...` để khớp signature và tránh crash ở `/api/v1/extraction/audio` và `/admin` Manual Trigger.
- Cập nhật fallback Groq: chuyển từ model đã bị gỡ `llama3-70b-8192` sang `"llama-3.3-70b-versatile"` (và `"llama-3.1-70b-versatile"` làm dự phòng), log chi tiết lỗi để phân biệt quota vs model issues khi xem trong Admin UI.
- Ghi nhận blocker persist Supabase: `save_lecture_pipeline` lỗi `PGRST204` vì bảng `lectures` chưa có cột `knowledge_chunks`; pipeline vẫn trả dữ liệu cho UI nhưng `persisted=false`.
- Sprint tích hợp Supabase (2026-03): Auth + Realtime library/settings + Quiz/Analytics + placeholder `processing` trên `lectures`; backend retry upsert không `knowledge_chunks`; FE `RequireAuth` chỉ khi có `VITE_SUPABASE_*`.
- Fix schema mismatch Supabase (2026-03-31): backend persist/read `lectures` chuyển sang dùng `video_url` (không còn `video_id/source_url`), upsert `on_conflict=video_url`, và align payload với cột `quiz/summary`. Nếu vẫn gặp `PGRST204` sau khi ALTER table, **restart FastAPI** và bấm **Reload schema** trong Supabase để refresh PostgREST cache.

---

## 8. System Integration Status

### 8.1 API flow contract (Backend)
- Endpoint: `POST /api/v1/extraction/audio`
- Request: `{ "url": "<youtube url>", "user_id": "<optional supabase auth uuid>" }`
- Response (key parts consumed by FE):
  - `transcription.segments[]`: `{ start, end, text }` (dùng cho context-menu + clip loop)
  - `react_flow`: `{ nodes, edges }` (React Flow graph; mỗi node có `data.timestamp`)
  - `quiz`: JSON (chưa bind đầy đủ ra UI Quiz Center)
  - `tutor`: JSON (chưa render đầy đủ ở TutorSidebar)
  - `persisted`, `lecture_id` (id Supabase: placeholder sau extract hoặc sau save; hỗ trợ Realtime + UI), `persist_message`

**Current blocker (database):**
- Supabase đang trả `PGRST204`: `Could not find the 'knowledge_chunks' column of 'lectures' in the schema cache`.
- Trạng thái hiện tại: extraction/transcribe/AI vẫn chạy, response trả về FE/Admin bình thường, nhưng bước lưu cloud fail (`persisted=false`).
- Hành động cần ở DB: thêm cột `knowledge_chunks jsonb` vào `lectures` hoặc chỉnh backend không gửi field này khi schema chưa sẵn sàng.

### 8.2 Admin UI (Control plane)
- `GET http://127.0.0.1:8000/admin`
- Gradio Admin Panel (tabs, **ds-surface-glass** styling — deep navy glass, violet accent):
  - **System Config:** `GROQ_API_KEY`, `GOOGLE_API_KEY`, `SUPABASE_URL`, `SUPABASE_KEY`, **`AI_PROVIDER`** (`auto` / `groq` / `google`); lưu `backend/.env` + reload `pydantic-settings`; **trạng thái kết nối** Groq / Google / Supabase (dot xanh/đỏ).
  - **Live Pipeline:** Manual Trigger full pipeline (Extract → Transcribe → AI → Save); **live log** + **metrics real-time** (Timer ~0.6s): công thức **Score = 0.4·S + 0.4·T + 0.2·K** (S cosine summary↔transcript, T % node timestamp khớp segment ±2s, K keyword F1); sau AI có partial latency, sau persist có full latency + `pipeline_metrics` trong JSON response.
  - **Analytics & Quality:** bảng gần đây từ Supabase **`system_logs`** (cần chạy `supabase/sql/system_logs.sql`); **Export** báo cáo đánh giá **CSV** / **PDF** (PDF cần `reportlab` trong venv).
- Backend: mỗi run ghi **`system_logs`** (latency, provider, confidence, S/T/K, refined) khi Supabase cấu hình; nếu **accuracy &lt; 0.6** thì `ai_service` có **refinement pass** tự động regenerate mindmap/quiz/tutor.
- API `POST /api/v1/extraction/audio` response thêm optional **`pipeline_metrics`** (latency, provider, confidence, accuracy components, refined).

### 8.3 Frontend rendering (Workspace)
- `DashboardPage`: `Start pipeline` → `postAudioExtraction(url, user?.id)`; `useAppStore` fetch + **Realtime** `lectures`; thẻ **Processing** khi `status === 'processing'`.
- Store `useWorkspaceStore` giữ:
  - `pipelineSourceUrl`, `pipelineReactFlow`, `transcriptSegments`, `tutor`, `quiz`
- `WorkspacePage`:
  - render videoUrl theo pipeline; `?lecture=<uuid>` load hàng từ Supabase → `setPipelineResult`
  - nút extraction chạy lại pipeline với `pipelineSourceUrl` + `user_id`
- `MindmapPanel`:
  - bỏ hard-code diagram demo; render từ `pipelineReactFlow`
  - deep time-linking: click node dùng `node.data.timestamp` để `seek`
  - right-click: dùng `transcriptSegments` để chọn `{start, end}` cho clip loop

---

## 9. Database & Realtime policies (Supabase)

**Mục tiêu:** Realtime (INSERT/UPDATE trên `lectures`) và Auth an toàn trong production đòi hỏi **RLS (Row Level Security)** trên các bảng public, cùng **publication** cho Realtime.

### 9.1 DDL gợi ý (SQL Editor / migration)

File tổng hợp trong repo: `supabase/sql/lectures_pipeline_columns.sql` (tạo `user_preferences`, `quiz_data`, `quiz_results`, …). Lỗi **`user_preferences` / `quiz_data` không có trong schema cache** → chạy file đó rồi **Reload schema** trong Dashboard.

```sql
-- lectures: trạng thái pipeline + owner (tên cột kiểm tra trùng môi trường trước khi chạy)
alter table public.lectures add column if not exists status text default 'ready';
alter table public.lectures add column if not exists user_id uuid references auth.users (id) on delete set null;
alter table public.lectures add column if not exists knowledge_chunks jsonb default '[]'::jsonb;
alter table public.lectures add column if not exists quiz_data jsonb default '{"questions":[]}'::jsonb;
alter table public.lectures add column if not exists flow_data jsonb default '{"nodes":[],"edges":[]}'::jsonb;
alter table public.lectures add column if not exists tutor_data jsonb default '{"summary":"","key_points":[]}'::jsonb;

create table if not exists public.user_preferences (
  user_id uuid primary key references auth.users (id) on delete cascade,
  prefs jsonb not null default '{}'::jsonb,
  updated_at timestamptz default now()
);

create table if not exists public.quiz_results (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  lecture_id text,
  score numeric not null,
  total_questions int not null,
  answers jsonb not null default '[]'::jsonb,
  created_at timestamptz default now()
);

-- Realtime: thêm bảng vào publication (tên có thể là supabase_realtime)
alter publication supabase_realtime add table public.lectures;
alter publication supabase_realtime add table public.user_preferences;
```

*(Bổ sung `replica identity full` trên bảng nếu cần payload UPDATE/DELETE đầy đủ.)*

### 9.2 RLS production

- **Bắt buộc** trước khi mở app public: `enable row level security` cho `lectures`, `user_preferences`, `quiz_results`.  
- `user_preferences`: chỉ `auth.uid() = user_id`.  
- `lectures`: team định nghĩa đọc theo `user_id` hoặc bản ghi chia sẻ; backend (service role) bypass RLS khi ghi pipeline.  
- `quiz_results`: chỉ chủ `user_id`.  
- **Service role** chỉ trên backend FastAPI; frontend chỉ **anon key** + policies.

### 9.3 Realtime INSERT từ FastAPI

Upsert qua Supabase Python (service role) vẫn tạo WAL event. Client Realtime nhận được nếu bảng trong publication và session anon có `select` phù hợp (sau RLS).
