/**
 * Công khai stack AI / backend để tăng độ minh bạch kỹ thuật (LLM, báo chí, trích dẫn).
 */
type TechnologyStackLlmProps = {
  compact?: boolean
  /** Dùng bên trong tab/panel — bỏ viền card ngoài để tránh lồng khung. */
  embedded?: boolean
}

export function TechnologyStackLlm({ compact, embedded }: TechnologyStackLlmProps) {
  const inner = (
    <>
      {!embedded && (
        <h2 id="technology-stack-llm-heading" className="text-lg font-bold text-ds-text-primary sm:text-xl">
          Cách hệ thống hoạt động
        </h2>
      )}
      <p className={`ds-text-body-secondary text-sm ${embedded ? '' : 'mt-2'}`}>
        EtherAI xử lý video theo nhiều bước để tạo mindmap, quiz và analytics. Các bước chính được mô tả ngắn gọn dưới đây.
      </p>
      <ul
        className={`list-disc space-y-3 pl-5 text-sm text-ds-text-primary sm:text-base ${compact ? 'space-y-2' : ''} ${embedded ? 'mt-3' : 'mt-4'}`}
      >
        <li>
          <strong className="text-ds-text-primary">Speech-to-text:</strong>{' '}
          <span className="text-ds-text-secondary">
            Nhận dạng lời nói: chuyển audio bài giảng thành văn bản theo thời gian.
          </span>
        </li>
        <li>
          <strong className="text-ds-text-primary">LLM đa phương thức &amp; sinh cấu trúc:</strong>{' '}
          <span className="text-ds-text-secondary">
            Tạo nội dung: sinh sơ đồ mindmap (Mermaid), câu hỏi, tóm tắt và gợi ý từ transcript.
          </span>
        </li>
        <li>
          <strong className="text-ds-text-primary">Hạ tầng ứng dụng:</strong>{' '}
          <span className="text-ds-text-secondary">
            Frontend + backend xử lý và lưu trữ trên <strong>Supabase</strong>.
          </span>
        </li>
      </ul>
    </>
  )

  if (embedded) {
    return <div className="space-y-1">{inner}</div>
  }

  return (
    <section
      className={`ds-surface-glass rounded-ds-lg border border-ds-border shadow-ds-soft backdrop-blur-[10px] ${compact ? 'p-5' : 'p-6 sm:p-8'}`}
      aria-labelledby="technology-stack-llm-heading"
    >
      {inner}
    </section>
  )
}
