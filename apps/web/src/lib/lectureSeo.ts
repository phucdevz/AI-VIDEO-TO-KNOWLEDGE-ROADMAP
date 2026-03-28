import { SITE_NAME } from './site'

/** og:title / document title pattern (tiếng Việt). */
export function lectureOgTitle(lectureTitle: string): string {
  return `Sơ đồ tư duy bài giảng: ${lectureTitle} - Trích xuất bởi AI`
}

/** og:description (tiếng Việt). */
export function lectureOgDescription(lectureTitle: string, courseName?: string): string {
  const course = courseName ? ` Khóa: ${courseName}.` : ''
  return `Xem video, sơ đồ tư duy và các mốc thời gian được AI liên kết cho “${lectureTitle}”.${course} Ứng dụng ${SITE_NAME}.`
}

/** Schema.org duration từ giây (ví dụ PT4M12S). */
export function secondsToSchemaDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  let out = 'PT'
  if (h > 0) out += `${h}H`
  if (m > 0) out += `${m}M`
  if (sec > 0 || out === 'PT') out += `${sec}S`
  return out
}
