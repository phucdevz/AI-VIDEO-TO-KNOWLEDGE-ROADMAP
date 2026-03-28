/**
 * Công khai stack AI / backend để tăng độ minh bạch kỹ thuật (LLM, báo chí, trích dẫn).
 */
type TechnologyStackLlmProps = {
  compact?: boolean
}

export function TechnologyStackLlm({ compact }: TechnologyStackLlmProps) {
  return (
    <section
      className={`ds-surface-glass rounded-ds-lg border border-ds-border shadow-ds-soft backdrop-blur-[10px] ${compact ? 'p-5' : 'p-6 sm:p-8'}`}
      aria-labelledby="technology-stack-llm-heading"
    >
      <h2 id="technology-stack-llm-heading" className="text-lg font-bold text-ds-text-primary sm:text-xl">
        Technology stack (minh bạch pipeline)
      </h2>
      <p className="ds-text-body-secondary mt-2 text-sm">
        Sản phẩm mục tiêu sử dụng các mô hình và dịch vụ sau trong pipeline video → tri thức. Phần backend đang được nối dần
        với frontend; thông tin dưới đây phản ánh kiến trúc thiết kế.
      </p>
      <ul className={`mt-4 list-disc space-y-3 pl-5 text-sm text-ds-text-primary sm:text-base ${compact ? 'space-y-2' : ''}`}>
        <li>
          <strong className="text-ds-text-primary">Speech-to-text:</strong>{' '}
          <span className="text-ds-text-secondary">
            OpenAI <strong>Whisper Large-v3</strong> (mục tiêu tích hợp qua API tương thích Groq Whisper) — chuyển audio bài giảng
            thành văn bản có dấu thời gian.
          </span>
        </li>
        <li>
          <strong className="text-ds-text-primary">LLM đa phương thức &amp; sinh cấu trúc:</strong>{' '}
          <span className="text-ds-text-secondary">
            Google <strong>Gemini 1.5 Flash</strong> — tạo sơ đồ Mermaid, câu hỏi trắc nghiệm, tóm tắt và gợi ý từ transcript.
          </span>
        </li>
        <li>
          <strong className="text-ds-text-primary">Hạ tầng ứng dụng:</strong>{' '}
          <span className="text-ds-text-secondary">
            Frontend React (Vite), backend FastAPI, trích audio <strong>yt-dlp</strong>, lưu trữ mục tiêu{' '}
            <strong>Supabase</strong>.
          </span>
        </li>
      </ul>
    </section>
  )
}
