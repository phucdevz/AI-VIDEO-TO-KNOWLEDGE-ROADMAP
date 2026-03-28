/** Brand + canonical base URL (set `VITE_SITE_URL` in production). */
export const SITE_NAME = 'EtherAI'

export function getSiteUrl(): string {
  const raw = import.meta.env.VITE_SITE_URL?.trim()
  if (!raw) return ''
  return raw.replace(/\/$/, '')
}

export function canonicalUrl(path: string): string | undefined {
  const base = getSiteUrl()
  if (!base) return undefined
  const p = path.startsWith('/') ? path : `/${path}`
  if (p === '/' || p === '') return `${base}/`
  return `${base}${p}`
}
