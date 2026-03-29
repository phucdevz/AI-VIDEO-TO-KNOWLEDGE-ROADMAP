/**
 * Tóm tắt ngắn theo nút mindmap (mock pipeline Gemini / transcript — thay bằng API sau).
 */
export function getMindmapNodeAiSummary(label: string): string {
  const s = label.trim()
  if (!s) {
    return 'Nội dung nút chưa xác định. Khi pipeline AI kết nối, tóm tắt sẽ lấy từ transcript tại mốc thời gian tương ứng.'
  }
  if (/lecture core|^root$/i.test(s)) {
    return 'Khung bài giảng: mục tiêu học, phạm vi và cách các khối kiến thức (Concepts, Skills) liên kết với video.'
  }
  if (/concepts/i.test(s)) {
    return 'Nhánh lý thuyết: định nghĩa và mô hình cốt lõi (Attention, Transformers) — AI rút từ các đoạn giải thích trong video.'
  }
  if (/attention/i.test(s)) {
    return 'Cơ chế Attention: trọng số theo ngữ cảnh và vì sao nó thay thế kiến trúc tuần tự cổ điển trong bài.'
  }
  if (/transformers/i.test(s)) {
    return 'Kiến trúc Transformer: self-attention xếp lớp, song song hóa và liên hệ tới mô hình ngôn ngữ hiện đại.'
  }
  if (/skills/i.test(s)) {
    return 'Nhánh thực hành: triển khai, đánh giá và bài tập — neo với đoạn demo code / case study trong lecture.'
  }
  if (/implementation/i.test(s)) {
    return 'Triển khai thực tế: API, huấn luyện nhẹ hoặc suy luận — tóm tắt các bước chính được nói trong video.'
  }
  if (/evaluation/i.test(s)) {
    return 'Đánh giá mô hình: metric, tập dev/test và cạm bẫy thường gặp — ôn nhanh trước khi làm quiz.'
  }
  return 'EtherAI sẽ sinh đoạn tóm tắt từ transcript có timestamp khi pipeline Gemini được bật cho bài giảng này.'
}
