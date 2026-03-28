/** Upper bound for seek targets (sanity check; tune when video duration is known). */
export const MAX_SEEK_SECONDS = 6 * 60 * 60

export type SeekValidation =
  | { ok: true }
  | { ok: false; message: string }

export function validateSeekSeconds(seconds: number): SeekValidation {
  if (typeof seconds !== 'number' || Number.isNaN(seconds) || !Number.isFinite(seconds)) {
    return { ok: false, message: 'Mốc thời gian không hợp lệ.' }
  }
  if (seconds < 0) {
    return { ok: false, message: 'Mốc thời gian không thể âm.' }
  }
  if (seconds > MAX_SEEK_SECONDS) {
    return { ok: false, message: 'Mốc thời gian vượt quá giới hạn cho phép.' }
  }
  return { ok: true }
}
