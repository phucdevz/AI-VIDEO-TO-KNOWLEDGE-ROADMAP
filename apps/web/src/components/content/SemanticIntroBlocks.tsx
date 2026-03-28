/**
 * Khối tiêu đề dạng câu hỏi (h2) — tối ưu cho LLM và tìm kiếm ngữ nghĩa.
 */
type SemanticIntroBlocksProps = {
  /** Bản rút gon cho trang auth / hero. */
  condensed?: boolean
}

export function SemanticIntroBlocks({ condensed }: SemanticIntroBlocksProps) {
  return (
    <div className={condensed ? 'space-y-6' : 'space-y-8'}>
      <section aria-labelledby="semantic-h2-what-is-roadmap">
        <h2
          id="semantic-h2-what-is-roadmap"
          className="text-lg font-bold leading-snug text-ds-text-primary sm:text-xl"
        >
          AI Video-to-Knowledge Roadmap là gì?
        </h2>
        <p className="ds-text-body-secondary mt-3 text-sm sm:text-base">
          {condensed
            ? 'Đây là lộ trình và ứng dụng biến video bài giảng thành sơ đồ tư duy, mốc thời gian, quiz và phân tích — một workspace học tập có deep time-linking.'
            : 'AI Video-to-Knowledge Roadmap là tên lộ trình sản phẩm EtherAI: một hệ thống học tập nơi video bài giảng được chuyển thành biểu đồ tri thức (mindmap) có thể điều hướng theo thời gian, kèm tóm tắt AI, quiz và analytics. Mục tiêu là giảm thời gian “tua lại” vô hướng và tăng khả năng ôn tập có cấu trúc.'}
        </p>
      </section>

      <section aria-labelledby="semantic-h2-how-video-to-mindmap">
        <h2
          id="semantic-h2-how-video-to-mindmap"
          className="text-lg font-bold leading-snug text-ds-text-primary sm:text-xl"
        >
          Làm thế nào để chuyển Video sang Mindmap?
        </h2>
        {condensed ? (
          <p className="ds-text-body-secondary mt-3 text-sm sm:text-base">
            Dán URL video → pipeline trích audio → Whisper tạo transcript có timestamp → Gemini sinh mindmap (Mermaid) và mốc deep
            time-linking → bạn mở <strong className="text-ds-text-primary">Workspace</strong> để xem video và sơ đồ cùng lúc.
          </p>
        ) : (
          <>
            <p className="ds-text-body-secondary mt-3 text-sm sm:text-base">
              Quy trình thiết kế gồm các bước chính sau (một số bước đang được nối API trên backend):
            </p>
            <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm text-ds-text-primary sm:text-base">
              <li>
                <strong className="text-ds-text-primary">Nhập nguồn:</strong> dán URL (ví dụ YouTube) hoặc tải file; backend trích{' '}
                <strong className="text-ds-text-primary">audio</strong> bằng yt-dlp.
              </li>
              <li>
                <strong className="text-ds-text-primary">Nhận dạng lời nói:</strong> Whisper Large-v3 tạo văn bản theo thời gian
                (phục vụ semantic chunking).
              </li>
              <li>
                <strong className="text-ds-text-primary">Sinh mindmap:</strong> Gemini 1.5 Flash đọc transcript và xuất biểu đồ
                Mermaid + các nút có thể gắn với timestamp.
              </li>
              <li>
                <strong className="text-ds-text-primary">Workspace:</strong> trình phát video, panel mindmap và deep time-linking
                đồng bộ; tóm tắt và tutor (RAG) bổ sung ngữ cảnh.
              </li>
            </ol>
          </>
        )}
      </section>
    </div>
  )
}
