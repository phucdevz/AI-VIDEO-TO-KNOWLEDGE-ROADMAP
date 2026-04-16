# EtherAI — AI Video to Knowledge Roadmap

> Biến video bài giảng thành **mindmap tương tác**, quiz, AI Tutor có trích dẫn mốc thời gian và analytics — pipeline trích audio, chép lời, sinh cấu trúc bằng LLM, lưu Supabase.

**English:** Full-stack app that turns lecture videos into a navigable knowledge graph with **Deep Time-linking** (mindmap nodes seek the player), grounded tutor Q&A, and quizzes.

---

## Tính năng chính

| Mô-đun | Mô tả |
|--------|--------|
| **Trích audio** | Tải / tách audio từ URL video (`yt-dlp`, FFmpeg). |
| **Chép lời** | Groq Whisper / Google Gemini — đoạn có **mốc thời gian**. |
| **Mindmap** | Đồ thị React Flow, nút gắn timestamp — **Deep Time-linking** tới player. |
| **Quiz & tutor** | Quiz từ nội dung bài; tutor trả lời có **grounding** (citations / seek). |
| **Analytics** | Dashboard; Realtime Supabase khi cấu hình. |
| **Admin** | Giao diện quản trị (Gradio / FastAPI) — tùy bản triển khai. |

---

## Kiến trúc tổng quan

```text
Video URL → Audio (temp) → Transcription (segments)
         → LLM → JSON (mindmap, quiz, tutor)
         → Supabase → Frontend (player + mindmap + quiz + tutor)
```

- **Frontend:** SPA React (Vite), gọi API FastAPI; auth Supabase (hoặc chế độ demo khi chưa cấu hình).
- **Backend:** FastAPI, pipeline xử lý bất đồng bộ / từng bước tùy route; có thể tích hợp admin UI.

---

## Công nghệ

| Lớp | Công nghệ |
|-----|-----------|
| **Web** | React 19, Vite, TypeScript, Tailwind CSS, Zustand, `@xyflow/react`, Framer Motion |
| **API** | FastAPI, Uvicorn, Pydantic, `yt-dlp`, Groq SDK, Google Generative AI |
| **Dữ liệu / auth** | Supabase (PostgreSQL, Realtime) |
| **Design** | `@ether/design-tokens` (monorepo) |

---

## Yêu cầu hệ thống

- **Node.js** 18+ và **npm** (workspaces).
- **Python** 3.12+ (khuyến nghị) và **pip**.
- **FFmpeg** (pipeline audio / video).

---

## Cài đặt nhanh

### 1. Clone và cài dependency gốc

```bash
git clone <repository-url>
cd AI-VIDEO-TO-KNOWLEDGE-ROADMAP
npm install
```

### 2. Backend

```bash
cd backend
python -m venv venv
# Windows:
venv\Scripts\activate
# macOS / Linux:
# source venv/bin/activate

pip install -r requirements.txt
copy .env.example .env   # Windows — chỉnh biến mặc định
# hoặc: cp .env.example .env
```

Chạy API:

```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

- Swagger: `http://127.0.0.1:8000/docs`
- Health (nếu có route): `GET /api/v1/health`

### 3. Frontend

Từ **thư mục gốc repo**:

```bash
npm run dev
```

Mặc định Vite: `http://localhost:5173` (hoặc `http://127.0.0.1:5173`).

Tạo `apps/web/.env` từ `apps/web/.env.example` và chỉnh `VITE_API_URL` trùng cổng backend.

### Build production

```bash
npm run build
```

(`prebuild` sẽ chạy sinh `public/sitemap.xml` và `robots.txt` qua `tsx scripts/generate-seo-files.ts`.)

### Chạy bằng Docker Compose

Từ thư mục gốc repo:

```bash
docker compose up --build
```

Sau khi chạy:

- Frontend: `http://localhost:5173`
- Backend docs: `http://localhost:8000/docs`

Lưu ý:

- Các biến API key/Supabase cho backend được đọc từ biến môi trường shell khi chạy compose (ví dụ `GROQ_API_KEY`, `GOOGLE_API_KEY`, `SUPABASE_URL`, `SUPABASE_KEY`).
- Các biến `VITE_*` cho frontend được bake vào image tại build-time (qua `docker-compose.yml` `build.args`).
- Audio tạm của backend được lưu trên volume `backend_temp_audio`.

---

## Biến môi trường

Không commit file `.env` thật; chỉ dùng `.env.example` làm mẫu.

### `backend/.env`

| Biến | Ý nghĩa |
|------|---------|
| `API_HOST`, `API_PORT` | Địa chỉ bind (ví dụ `0.0.0.0`, `8000`) |
| `TEMP_AUDIO_DIR` | Thư mục file tạm audio |
| `CORS_ORIGINS` | Origin SPA, cách nhau bởi dấu phẩy |
| `GROQ_API_KEY` | Groq (Whisper / LLM) |
| `GOOGLE_API_KEY` | Google AI (Gemini) |
| `SUPABASE_URL`, `SUPABASE_KEY` | Supabase server |
| `AI_PROVIDER` | `auto` \| `groq` \| `google` |

Chi tiết: `backend/.env.example`.

### `apps/web/.env`

| Biến | Ý nghĩa |
|------|---------|
| `VITE_API_URL` | Base URL FastAPI (ví dụ `http://127.0.0.1:8000`) |
| `VITE_SUPABASE_URL` | URL Supabase |
| `VITE_SUPABASE_ANON_KEY` | JWT anon (dạng `eyJ…`); không dùng publishable key sai loại |
| `VITE_SITE_URL` | (Tuỳ chọn) URL canonical cho SEO |

Nếu **không** set Supabase, app có thể chạy UI với thư viện mock / bỏ qua gate đăng nhập (xem code `RequireAuth`).

---

## Lệnh phổ biến

| Lệnh | Mô tả |
|------|--------|
| `npm run dev` | Chạy Vite (workspace `web`) |
| `npm run build` | `seo:generate` + `tsc` + build Vite |
| `npm run preview` | Xem bản build production cục bộ |

Trong `apps/web`:

| Lệnh | Mô tả |
|------|--------|
| `npm run seo:generate` | Tạo `public/sitemap.xml`, `public/robots.txt` từ `src/data/appData.ts` |
| `npm run lint` | ESLint |

---

## Cấu trúc thư mục

| Đường dẫn | Vai trò |
|-----------|---------|
| `backend/` | FastAPI, pipeline AI, admin (nếu bật) |
| `apps/web/` | SPA React |
| `apps/web/src/data/appData.ts` | Dữ liệu tĩnh / demo (mock lectures, template Knowledge Pack) — một nguồn gom |
| `packages/design-tokens/` | Token giao diện Ether |
| `supabase/sql/` | Script SQL (index, cột pipeline, v.v.) — chạy thủ công trên Supabase |

---

## Cơ sở dữ liệu (Supabase)

- Áp dụng migration / script trong `supabase/sql/` theo tài liệu từng file (ví dụ index trên `video_url`, cột pipeline cho bảng `lectures`).
- Đồng bộ schema với `DatabaseService` / API backend để tránh lỗi cột không tồn tại.

---

## Đánh giá chất lượng pipeline

Dự án có thể theo dõi **WER** (chép lời), **cosine similarity** (retrieval tutor), **F1** (đầu ra có cấu trúc) — phục vụ regression khi đổi model hoặc prompt.

---

## Giao diện (Ether)

Glass / navy, accent tím điện; token trong `packages/design-tokens` và `apps/web/src/index.css`. Chi tiết thêm: `apps/web/docs/design.md`.

---

## Định hướng phát triển

- Tổng hợp tri thức trên nhiều video / khóa học.
- Không gian làm việc cộng tác (annotation, realtime).

---

## Giấy phép

Nếu repo có file `LICENSE`, áp dụng theo file đó; nếu chưa có, vui lòng bổ sung giấy phép rõ ràng trước khi phân phối.

---

## Đóng góp

PR và issue được hoan nghênh. Nên chạy `npm run lint` (frontend) và kiểm tra pipeline backend trước khi gửi thay đổi lớn.
