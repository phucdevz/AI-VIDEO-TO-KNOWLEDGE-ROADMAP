import axios from 'axios'

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

api.interceptors.response.use(
  (r) => r,
  (err) => {
    // Central place for 401 handling / toast later
    return Promise.reject(err)
  },
)

/** Typed helpers — extend as routes grow */
export async function postAudioExtraction(url: string) {
  const { data } = await api.post('/api/v1/extraction/audio', { url })
  return data
}
