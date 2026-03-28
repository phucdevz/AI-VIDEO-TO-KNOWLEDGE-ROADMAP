import { useEffect, useRef, type RefObject } from 'react'

type ProcessingVisualizerProps = {
  /** Bật animation hạt Video → Mindmap. */
  active: boolean
  /** Khung chứa cột workspace (position: relative). */
  containerRef: RefObject<HTMLElement | null>
  /** Cột / khối video. */
  fromRef: RefObject<HTMLElement | null>
  /** Cột / khối mindmap. */
  toRef: RefObject<HTMLElement | null>
  className?: string
}

type Particle = {
  t: number
  speed: number
  x0: number
  y0: number
  x1: number
  y1: number
  r: number
  wobbleAmp: number
  wobbleFreq: number
  phase: number
  alpha: number
}

function randomBetween(a: number, b: number) {
  return a + Math.random() * (b - a)
}

function easeOutCubic(u: number) {
  return 1 - (1 - u) ** 3
}

function spawnParticle(
  from: DOMRect,
  to: DOMRect,
  cr: DOMRect,
  stacked: boolean,
): Particle {
  let x0: number
  let y0: number
  let x1: number
  let y1: number

  if (stacked) {
    x0 = randomBetween(from.left + from.width * 0.15, from.left + from.width * 0.85) - cr.left
    y0 = from.bottom - cr.top + randomBetween(2, 14)
    x1 = randomBetween(to.left + to.width * 0.2, to.left + to.width * 0.8) - cr.left
    y1 = to.top - cr.top - randomBetween(4, 28)
  } else {
    x0 = from.right - cr.left - randomBetween(2, 24)
    y0 = randomBetween(from.top + from.height * 0.18, from.top + from.height * 0.82) - cr.top
    x1 = to.left - cr.left + randomBetween(4, 36)
    y1 = randomBetween(to.top + to.height * 0.15, to.top + to.height * 0.85) - cr.top
  }

  return {
    t: randomBetween(0, 0.85),
    speed: randomBetween(0.22, 0.55),
    x0,
    y0,
    x1,
    y1,
    r: randomBetween(1.2, 3.2),
    wobbleAmp: randomBetween(4, 14),
    wobbleFreq: randomBetween(2, 5),
    phase: randomBetween(0, Math.PI * 2),
    alpha: randomBetween(0.35, 0.95),
  }
}

/**
 * Canvas: hạt bay từ vùng video sang mindmap khi `active` — gợi ý pipeline trích xuất tri thức.
 */
export function ProcessingVisualizer({
  active,
  containerRef,
  fromRef,
  toRef,
  className = '',
}: ProcessingVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const particlesRef = useRef<Particle[]>([])
  const rafRef = useRef(0)
  const lastTsRef = useRef(0)

  useEffect(() => {
    const canvas = canvasRef.current
    const container = containerRef.current

    if (!active) {
      particlesRef.current = []
      if (canvas) {
        const ctx = canvas.getContext('2d')
        if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height)
      }
      return
    }

    if (!canvas || !container) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const COUNT = 56

    const resize = () => {
      const cr = container.getBoundingClientRect()
      const w = Math.max(1, cr.width)
      const h = Math.max(1, cr.height)
      const dpr = Math.min(typeof window !== 'undefined' ? window.devicePixelRatio : 1, 2)
      canvas.width = Math.floor(w * dpr)
      canvas.height = Math.floor(h * dpr)
      canvas.style.width = `${w}px`
      canvas.style.height = `${h}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }

    resize()

    const tick = (ts: number) => {
      const from = fromRef.current
      const to = toRef.current
      const cont = containerRef.current
      if (!from || !to || !cont || !canvasRef.current) {
        rafRef.current = requestAnimationFrame(tick)
        return
      }

      const last = lastTsRef.current || ts
      const dt = Math.min(0.05, (ts - last) / 1000)
      lastTsRef.current = ts

      const cr = cont.getBoundingClientRect()
      const w = cr.width
      const h = cr.height
      const fr = from.getBoundingClientRect()
      const tr = to.getBoundingClientRect()
      const stacked = tr.top >= fr.bottom - 8

      ctx.clearRect(0, 0, w, h)

      const particles = particlesRef.current
      while (particles.length < COUNT) {
        particles.push(spawnParticle(fr, tr, cr, stacked))
      }

      for (const p of particles) {
        p.t += dt * p.speed
        if (p.t >= 1) {
          Object.assign(p, spawnParticle(fr, tr, cr, stacked))
          continue
        }

        const u = easeOutCubic(p.t)
        const bx = p.x0 + (p.x1 - p.x0) * u
        const by = p.y0 + (p.y1 - p.y0) * u
        const wobble =
          Math.sin(p.phase + p.t * Math.PI * 2 * p.wobbleFreq) * p.wobbleAmp * (1 - u * 0.4)
        const px = stacked ? bx + wobble * 0.35 : bx
        const py = stacked ? by : by + wobble

        const fade = p.alpha * (0.35 + 0.65 * Math.sin(p.t * Math.PI))
        const r = p.r * (0.85 + 0.25 * (1 - u))

        const grd = ctx.createRadialGradient(px, py, 0, px, py, r * 3)
        grd.addColorStop(0, `rgba(125, 211, 252, ${fade})`)
        grd.addColorStop(0.45, `rgba(34, 211, 238, ${fade * 0.55})`)
        grd.addColorStop(1, 'rgba(34, 211, 238, 0)')

        ctx.fillStyle = grd
        ctx.beginPath()
        ctx.arc(px, py, r * 3, 0, Math.PI * 2)
        ctx.fill()

        ctx.fillStyle = `rgba(224, 250, 255, ${fade * 0.9})`
        ctx.beginPath()
        ctx.arc(px, py, r * 0.45, 0, Math.PI * 2)
        ctx.fill()
      }

      rafRef.current = requestAnimationFrame(tick)
    }

    lastTsRef.current = 0
    rafRef.current = requestAnimationFrame(tick)

    const ro = new ResizeObserver(() => {
      resize()
    })
    ro.observe(container)

    return () => {
      cancelAnimationFrame(rafRef.current)
      ro.disconnect()
      lastTsRef.current = 0
    }
  }, [active, containerRef, fromRef, toRef])

  if (!active) return null

  return (
    <div
      className={`pointer-events-none absolute inset-0 z-[12] overflow-hidden ${className}`}
      aria-hidden
    >
      <canvas ref={canvasRef} className="block h-full w-full" />
    </div>
  )
}
