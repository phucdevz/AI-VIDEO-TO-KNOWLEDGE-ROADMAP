-- =============================================================================
-- Nếu bạn đã chạy script cũ dùng `video_id` và gặp lỗi:
--   ERROR: column "video_id" does not exist
-- thì bảng `lectures` của bạn đã tồn tại với cột `video_url` (đúng với app).
-- Chạy file này để tạo index đúng cột — KHÔNG cần thêm cột video_id.
-- =============================================================================

create index if not exists lectures_video_url_idx on public.lectures (video_url);

-- (Tùy chọn) Gỡ index sai nếu đã tạo nhầm (bỏ comment nếu cần):
-- drop index if exists lectures_video_id_idx;
