# 🎓 AI Video-to-Knowledge Roadmap
> **Hệ thống tự động hóa tri thức và trực quan hóa lộ trình học tập từ Video bài giảng.**

[![FastAPI](https://img.shields.io/badge/Backend-FastAPI-009688?style=for-the-badge&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![React](https://img.shields.io/badge/Frontend-React-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://reactjs.org/)
[![Gemini](https://img.shields.io/badge/AI-Gemini%201.5%20Flash-blue?style=for-the-badge&logo=google-gemini&logoColor=white)](https://aistudio.google.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge)](https://opensource.org/licenses/MIT)

---

## Giới thiệu (Overview)
Dự án được phát triển nhằm giải quyết vấn đề "quá tải thông tin" từ các video bài giảng dài (YouTube, MS Teams, Zoom). Hệ thống sử dụng **Generative AI** để chuyển đổi dữ liệu video thô thành một hệ sinh thái tri thức có cấu trúc, giúp sinh viên tiết kiệm 80% thời gian ôn tập.

### 🎯 Mục tiêu đồ án:
* **Tự động hóa:** Trích xuất nội dung từ âm thanh video thành văn bản.
* **Trực quan hóa:** Chuyển văn bản thành Sơ đồ tư duy (Mindmap) tương tác.
* **Cá nhân hóa:** Tạo bộ câu hỏi ôn tập (Quiz) và dự đoán câu hỏi của giảng viên.

---

## Tính năng đột phá (Key Features)

### 1. Phân tích ngữ nghĩa & Timestamp (Deep Time-Linking)
* Chuyển đổi âm thanh video thành văn bản tiếng Việt chính xác.
* **Đột phá:** Nhấn vào các nhánh trong sơ đồ tư duy, video sẽ tự động nhảy đến đúng phân đoạn giảng viên đang nói về chủ đề đó.

### 2. Sơ đồ tư duy thông minh (Interactive Mindmap)
* Tự động tạo cấu trúc bài giảng bằng mã **Mermaid.js**.
* Hiển thị mối quan hệ giữa các khái niệm (Nguyên nhân - Kết quả, Thành phần - Hệ thống).

### 3. Trợ lý ôn tập AI (AI Tutor)
* **AI Quiz Generator:** Tự động tạo câu hỏi trắc nghiệm dựa trên nội dung video.
* **Instructor Prediction:** Dự đoán 3-5 câu hỏi hóc búa nhất mà giảng viên có thể hỏi trong kỳ thi.
* **RAG Chatbot:** Trò chuyện trực tiếp với video, AI chỉ trả lời dựa trên nội dung bài giảng (Tránh ảo giác AI).

---

## 🛠 Kiến trúc kỹ thuật (Technical Architecture)

* **Frontend:** React.js, Tailwind CSS, Lucide Icons, Mermaid.js.
* **Backend:** Python (FastAPI), Celery (Background Tasks).
* **AI Models:**
    * **Whisper (OpenAI):** Audio-to-Text Transcription.
    * **Gemini 1.5 Flash:** Knowledge Extraction & Logical Mapping.
* **Database:** Supabase (PostgreSQL) & ChromaDB (Vector Store cho RAG).

---

## Hướng dẫn cài đặt (Installation)

### 1. Yêu cầu hệ thống
* Python 3.9+ | Node.js 18+ | FFmpeg

### 2. Cài đặt Backend
```bash
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt 
```
### 3 . Cài đặt Frontend
```bash
cd frontend
npm install
```
### 4. Biến môi trường (.env)
Tạo file .env tại thư mục /backend:
```bash
GOOGLE_API_KEY=your_gemini_api_key_here
SUPABASE_URL=your_supabase_url
SUPABASE_KEY=your_supabase_anon_key
```

## Quy trình xử lý dữ liệu (Data Pipeline)
Input: Người dùng cung cấp Link YouTube hoặc File MP4.

Extraction: Trích xuất Audio -> Whisper trích xuất văn bản kèm Timestamp.

AI Reasoning: Gemini phân tích văn bản -> Xuất JSON (Quiz) và Mermaid Code (Mindmap).

Interactive UI: React hiển thị Video Player song song với Sơ đồ và bảng câu hỏi.

## Phản biện Hội đồng (VIVA Preparedness)
Tại sao không dùng ChatGPT? -> Hệ thống sử dụng RAG để đảm bảo độ chính xác 100% dựa trên nội dung video, tích hợp Deep Time-Linking mà Chatbot truyền thống không có.

Chi phí vận hành? -> Tối ưu hóa bằng Gemini Flash API (Free Tier) và xử lý tại chỗ (On-premise) cho Whisper, chi phí xấp xỉ 0 VNĐ.

## Liên hệ (Contact)
Sinh viên thực hiện: [Nguyễn Trường Phục]

Email: agenyluuvong@gmail.com

GitHub: [github.com/phucdevz]: 
