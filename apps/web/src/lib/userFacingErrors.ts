import { isAxiosError } from 'axios'

/**
 * Thông báo lỗi dành cho người dùng cuối (tiếng Việt, không lộ chi tiết kỹ thuật).
 */

export function friendlyAxiosErrorMessage(err: unknown): string {
  if (!isAxiosError(err)) {
    if (err instanceof Error) {
      const m = err.message
      if (/[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]/i.test(m)) {
        return m
      }
      return mapGenericEnglishError(m)
    }
    return 'Đã xảy ra lỗi. Vui lòng thử lại sau.'
  }
  if (err.code === 'ERR_CANCELED') return ''
  const status = err.response?.status
  const data = err.response?.data as { detail?: unknown } | undefined
  const d = data?.detail
  if (typeof d === 'string' && d.trim()) {
    return translateOrPassthroughApiDetail(d.trim())
  }
  if (Array.isArray(d) && d.length > 0) {
    const row = d[0] as { msg?: string }
    if (typeof row?.msg === 'string' && row.msg.trim()) {
      return translateOrPassthroughApiDetail(row.msg.trim())
    }
  }
  if (!err.response) {
    return 'Không kết nối được máy chủ. Kiểm tra mạng hoặc thử lại sau.'
  }
  if (status === 404) return 'Không tìm thấy nội dung yêu cầu.'
  if (status === 401 || status === 403) return 'Bạn không có quyền thực hiện thao tác này.'
  if (status === 429) return 'Quá nhiều yêu cầu. Vui lòng đợi một lúc rồi thử lại.'
  if (status != null && status >= 500) return 'Máy chủ đang bận hoặc gặp sự cố. Thử lại sau.'
  return mapGenericEnglishError(err.message)
}

function mapGenericEnglishError(message: string): string {
  const m = message.toLowerCase()
  if (m.includes('network error') || m.includes('networkerror')) {
    return 'Mất kết nối mạng. Kiểm tra Internet rồi thử lại.'
  }
  if (m.includes('timeout')) return 'Hết thời gian chờ. Thử lại sau.'
  return 'Đã xảy ra lỗi. Vui lòng thử lại sau.'
}

/** Chuỗi detail từ FastAPI — nếu đã là tiếng Việt thì giữ; nếu là tiếng Anh ngắn thì có thể map sau này. */
function translateOrPassthroughApiDetail(detail: string): string {
  if (/[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]/i.test(detail)) {
    return detail
  }
  const low = detail.toLowerCase()
  if (low.includes('not found')) return 'Không tìm thấy nội dung yêu cầu.'
  if (low.includes('unauthorized') || low.includes('forbidden')) return 'Bạn không có quyền thực hiện thao tác này.'
  if (low.includes('timeout')) return 'Hết thời gian chờ. Thử lại sau.'
  return detail.length > 160 ? 'Đã xảy ra lỗi. Vui lòng thử lại sau.' : detail
}

export function friendlySupabaseError(error: { message?: string; code?: string } | null | undefined): string {
  if (!error) return 'Đã xảy ra lỗi. Vui lòng thử lại sau.'
  const code = error.code
  const msg = (error.message ?? '').toLowerCase()

  if (code === 'PGRST116') return 'Không tìm thấy dữ liệu.'
  if (code === 'PGRST301' || code === '42501' || msg.includes('permission denied') || msg.includes('row-level security')) {
    return 'Bạn không có quyền thực hiện thao tác này.'
  }
  if (code === '23505') return 'Dữ liệu này đã tồn tại.'
  if (msg.includes('jwt') || msg.includes('invalid token') || msg.includes('session')) {
    return 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn. Vui lòng đăng nhập lại.'
  }
  if (msg.includes('network') || msg.includes('fetch failed')) {
    return 'Mất kết nối mạng. Thử lại sau.'
  }
  return 'Không thể hoàn tất thao tác. Vui lòng thử lại sau.'
}

export function friendlyAuthErrorMessage(raw: string | null | undefined): string {
  if (!raw?.trim()) return 'Đã xảy ra lỗi. Vui lòng thử lại sau.'
  const s = raw.toLowerCase()
  if (s.includes('supabase is not configured') || s.includes('missing vite_supabase')) {
    return 'Ứng dụng chưa được cấu hình đăng nhập. Liên hệ người quản trị hoặc kiểm tra file cài đặt.'
  }
  if (s.includes('sb_publishable') || s.includes('publishable key')) {
    return 'Khóa kết nối chưa đúng loại. Trong bảng điều khiển dịch vụ đăng nhập, hãy dùng khóa “anon” (public) dạng chuỗi dài bắt đầu bằng eyJ…'
  }
  if (s.includes('invalid login credentials') || s.includes('invalid credentials')) {
    return 'Email hoặc mật khẩu không đúng.'
  }
  if (s.includes('email not confirmed')) return 'Vui lòng xác nhận email trước khi đăng nhập.'
  if (s.includes('user already registered')) return 'Email này đã được đăng ký.'
  if (s.includes('password') && (s.includes('short') || s.includes('weak'))) {
    return 'Mật khẩu chưa đủ mạnh. Hãy chọn mật khẩu dài hơn.'
  }
  if (s.includes('rate limit') || s.includes('too many')) return 'Quá nhiều lần thử. Đợi vài phút rồi thử lại.'
  if (/[àáảãạăâêôơưỳýỵđ]/i.test(raw)) return raw
  return 'Không thể đăng nhập. Kiểm tra email và mật khẩu rồi thử lại.'
}
