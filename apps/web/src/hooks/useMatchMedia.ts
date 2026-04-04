import { useSyncExternalStore } from 'react'

/**
 * Subscribes to `window.matchMedia(query)` — SSR-safe (`getServerSnapshot` false).
 */
export function useMatchMedia(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      if (typeof window === 'undefined') return () => {}
      const mq = window.matchMedia(query)
      const fn = () => onChange()
      mq.addEventListener('change', fn)
      return () => mq.removeEventListener('change', fn)
    },
    () => (typeof window !== 'undefined' ? window.matchMedia(query).matches : false),
    () => false,
  )
}

/** Viewport &lt; 768px (Tailwind `md`). */
export function useIsMobileViewport(): boolean {
  return useMatchMedia('(max-width: 767px)')
}
