import { useEffect, useRef } from 'react'

type Particle = {
  t: number
  speed: number
  x0: number
  y0: number
  x1: number
  y1: number
  cx: number
  cy: number
  r: number
  wobbleAmp: number
  wobbleFreq: number
  phase: number
  alpha: number
}

function randomBetween(a: number, b: number) {
  return a + Math.random() * (b - a)
}

function easeInOutQuad(u: number) {
  return u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2
}

/** Điểm trên Bezier bậc 2: P0 → P1 (control) → P2 */
function quadBezierPoint(u: number, x0: number, y0: number, cx: number, cy: number, x1: number, y1: number) {
  const o = 1 - u
  const x = o * o * x0 + 2 * o * u * cx + u * u * x1
  const y = o * o * y0 + 2 * o * u * cy + u * u * y1
  return { x, y }
}

function spawnParticle(w: number, h: number): Particle {
  const x0 = randomBetween(w * 0.06, w * 0.22)
  const y0 = randomBetween(h * 0.32, h * 0.68)
  const x1 = randomBetween(w * 0.78, w * 0.94)
  const y1 = randomBetween(h * 0.32, h * 0.68)
  const cx = w * 0.5 + randomBetween(-w * 0.06, w * 0.06)
  const cy = randomBetween(h * 0.12, h * 0.38)

  return {
    t: randomBetween(0, 0.88),
    speed: randomBetween(0.18, 0.42),
    x0,
    y0,
    x1,
    y1,
    cx,
    cy,
    r: randomBetween(1.1, 3),
    wobbleAmp: randomBetween(3, 12),
    wobbleFreq: randomBetween(2.2, 4.5),
    phase: randomBetween(0, Math.PI * 2),
    alpha: randomBetween(0.4, 0.92),
  }
}

type ProcessingOverlayProps = {
  /** Khi false: dừng animation và xóa canvas. */
  active?: boolean
  className?: string
}

/**
 * Lớp phủ Canvas: hạt sáng chạy từ trái (video) sang phải (mindmap) theo đường cong — trích xuất tri thức.
 */
export function ProcessingOverlay({ active = true, className = '' }: ProcessingOverlayProps) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const particlesRef = useRef<Particle[]>([])
  const rafRef = useRef(0)
  const lastTsRef = useRef(0)

  useEffect(() => {
    const canvas = canvasRef.current
    const wrap = wrapRef.current

    if (!active) {
      particlesRef.current = []
      if (canvas) {
        const ctx = canvas.getContext('2d')
        if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height)
      }
      return
    }

    if (!canvas || !wrap) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const COUNT = 52

    const resize = () => {
      const cr = wrap.getBoundingClientRect()
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
      const wEl = wrapRef.current
      const cv = canvasRef.current
      if (!wEl || !cv) {
        rafRef.current = requestAnimationFrame(tick)
        return
      }

      const last = lastTsRef.current || ts
      const dt = Math.min(0.05, (ts - last) / 1000)
      lastTsRef.current = ts

      const cr = wEl.getBoundingClientRect()
      const w = Math.max(1, cr.width)
      const h = Math.max(1, cr.height)

      ctx.clearRect(0, 0, w, h)

      const particles = particlesRef.current
      while (particles.length < COUNT) {
        particles.push(spawnParticle(w, h))
      }

      for (const p of particles) {
        p.t += dt * p.speed
        if (p.t >= 1) {
          Object.assign(p, spawnParticle(w, h))
          continue
        }

        const u = easeInOutQuad(p.t)
        const { x: bx, y: by } = quadBezierPoint(u, p.x0, p.y0, p.cx, p.cy, p.x1, p.y1)

        const { x: bxNext, y: byNext } = quadBezierPoint(
          Math.min(1, u + 0.02),
          p.x0,
          p.y0,
          p.cx,
          p.cy,
          p.x1,
          p.y1,
        )
        const tx = bxNext - bx
        const ty = byNext - by
        const len = Math.hypot(tx, ty) || 1
        const nx = -ty / len
        const ny = tx / len
        const wobble =
          Math.sin(p.phase + p.t * Math.PI * 2 * p.wobbleFreq) * p.wobbleAmp * (1 - u * 0.35)
        const px = bx + nx * wobble
        const py = by + ny * wobble

        const fade = p.alpha * (0.4 + 0.6 * Math.sin(p.t * Math.PI))
        const r = p.r * (0.88 + 0.22 * (1 - u))

        const grd = ctx.createRadialGradient(px, py, 0, px, py, r * 3.2)
        grd.addColorStop(0, `rgba(124, 77, 255, ${fade * 0.85})`)
        grd.addColorStop(0.35, `rgba(0, 229, 255, ${fade * 0.5})`)
        grd.addColorStop(1, 'rgba(0, 229, 255, 0)')

        ctx.fillStyle = grd
        ctx.beginPath()
        ctx.arc(px, py, r * 3.2, 0, Math.PI * 2)
        ctx.fill()

        ctx.fillStyle = `rgba(230, 241, 255, ${fade * 0.75})`
        ctx.beginPath()
        ctx.arc(px, py, r * 0.42, 0, Math.PI * 2)
        ctx.fill()
      }

      rafRef.current = requestAnimationFrame(tick)
    }

    lastTsRef.current = 0
    rafRef.current = requestAnimationFrame(tick)

    const ro = new ResizeObserver(() => resize())
    ro.observe(wrap)

    return () => {
      cancelAnimationFrame(rafRef.current)
      ro.disconnect()
      lastTsRef.current = 0
    }
  }, [active])

  if (!active) return null

  return (
    <div
      ref={wrapRef}
      className={`pointer-events-none absolute inset-0 z-[15] overflow-hidden ${className}`}
      aria-hidden
    >
      <canvas ref={canvasRef} className="block h-full w-full" />
    </div>
  )
}
