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
- **State (client):** `zustand` — `useWorkspaceStore` (Deep Time-Linking), `useAppStore` (prefs UI)  
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

- `/login` — không bọc `Layout` (full-page auth).  
- Bọc `Layout`: `/` → redirect `/dashboard`, `/dashboard`, `/workspace`, `/quiz`, `/analytics`, `/settings`.  
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
- [x] **QuizCenter / Analytics / Settings:** shell UI + Recharts radar + heatmap grid; Settings có prefs (Zustand) + form API key (chưa persist).  
- [x] **Auth page:** login/signup toggle, aesthetic glass + gradient (không có auth thật).  
- [x] **Axios** `src/lib/api.ts` + helper `postAudioExtraction` khớp backend hiện tại.

### Backend

- [x] FastAPI app, CORS, prefix `/api/v1`.  
- [x] Health check.  
- [x] **Audio extraction service** (`yt-dlp`, `bestaudio/best`, lưu file dưới `TEMP_AUDIO_DIR`).  
- [x] Route async `POST /extraction/audio` (thread pool), schema Pydantic.

### DevEx

- [x] `apps/web/.env.example`, `backend/.env.example`.  
- [x] `dev.bat` ở root (Windows) chạy `npm run dev` cho frontend.

---

## 4. Pending Tasks (Chưa xong / cần làm tiếp)

### Pipeline AI & dữ liệu (theo README dự án)

- [ ] **Groq Whisper API** — transcript + timestamps (chưa có module/service).  
- [ ] **Gemini 1.5 Flash** — sinh Mermaid mindmap + JSON quiz (chưa có).  
- [ ] **Supabase** — schema, insert job/kết quả, storage file (chưa tích hợp).  
- [ ] **Celery / queue** (nếu theo kiến trúc README) — chưa có.

### Frontend

- [ ] **Nối Dashboard “Start pipeline”** → gọi `postAudioExtraction` + hiển thị trạng thái / lỗi.  
- [ ] **Mindmap từ API:** hiện diagram **hard-code** trong `MindmapPanel`; cần parse string Mermaid từ backend + error boundary.  
- [ ] **React Flow** (optional) — nếu cần chỉnh sửa graph tương tác thủ công (chưa trong repo).  
- [ ] **Quiz:** không có state câu hỏi thật, chấm điểm, hay đồng bộ backend.  
- [ ] **Analytics:** dữ liệu mock; cần API thật hoặc Supabase aggregates.  
- [ ] **Auth thật** (Supabase Auth / JWT) — hiện “Skip auth (dev)” và không bảo vệ route.  
- [ ] **API keys Settings:** chỉ UI; cần lưu an toàn (không commit, ideally backend proxy).  
- [ ] **i18n / a11y audit** — chưa có kế hoạch cụ thể.

### Backend

- [ ] Endpoint transcribe, generate mindmap/quiz, persist DB.  
- [ ] **Không expose** đường dẫn file local trong production — cần object storage + signed URL.  
- [ ] Auth / rate limit / user scoping.

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
6. **`.env` backend:** không commit; `backend/.env.example` đã liệt kê placeholder `GROQ_API_KEY`, `GOOGLE_API_KEY`, `SUPABASE_*` — **chưa đọc trong code**.  
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
