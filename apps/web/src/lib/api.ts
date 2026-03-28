import axios, { isAxiosError } from 'axios'

import { useToastStore } from '../stores/useToastStore'

/**
 * Axios client for FastAPI (`backend`). Set `VITE_API_URL` in `.env` (see `.env.example`).
 */
export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? 'http://127.0.0.1:8000',
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 120_000,
})

function messageFromApiError(err: unknown): string {
  if (!isAxiosError(err)) {
    return err instanceof Error ? err.message : 'Lỗi không xác định'
  }
  if (err.code === 'ERR_CANCELED') return ''
  const data = err.response?.data as { detail?: unknown } | undefined
  const d = data?.detail
  if (typeof d === 'string') return d
  if (Array.isArray(d) && d.length > 0) {
    const row = d[0] as { msg?: string }
    if (typeof row?.msg === 'string') return row.msg
  }
  if (!err.response) return 'Không kết nối được máy chủ. Kiểm tra backend đã chạy chưa.'
  if (err.response.status === 404) return 'Không tìm thấy tài nguyên API.'
  return err.message || 'Lỗi API'
}

api.interceptors.response.use(
  (r) => r,
  (err) => {
    const msg = messageFromApiError(err)
    if (msg) {
      useToastStore.getState().pushToast(msg, 'error')
    }
    return Promise.reject(err)
  },
)

/** Typed helpers — extend as routes grow */
export async function postAudioExtraction(url: string) {
  const { data } = await api.post('/api/v1/extraction/audio', { url })
  return data
}
