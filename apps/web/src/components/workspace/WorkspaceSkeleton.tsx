const ZIG_Y = [28, 52, 76, 100, 124, 148, 172, 196] as const

function horizontalZigzag(y: number): string {
  const parts: string[] = [`M0 ${y}`]
  for (let x = 0; x < 400; x += 20) {
    parts.push(`L${x + 10} ${y - 7}`, `L${x + 20} ${y}`)
  }
  return parts.join(' ')
}

/**
 * Placeholder 3 cột (Video | Mindmap | Tutor) khi workspace đang tải — pulse + zigzag gợi ý AI đang vẽ mindmap.
 */
export function WorkspaceSkeleton() {
  return (
    <div
      className="flex min-h-[calc(100vh-4rem)] min-w-0 flex-col gap-3 overflow-x-clip overflow-y-auto px-4 pb-4 pt-4 max-md:pb-2 lg:h-[calc(100vh-4rem)] lg:gap-4 lg:overflow-hidden lg:px-6 lg:pb-4"
      aria-busy="true"
      aria-label="Đang tải workspace"
    >
      <div className="flex w-full shrink-0 flex-wrap items-center justify-end gap-2">
        <div className="h-9 w-36 animate-pulse rounded-ds-sm bg-ds-border" />
        <div className="h-9 w-28 animate-pulse rounded-ds-sm bg-ds-border" />
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-4 lg:flex-row lg:min-h-0">
        {/* Video */}
        <section className="order-1 w-full min-w-0 shrink-0 lg:order-none lg:w-[30%]">
          <div className="flex min-h-0 flex-col rounded-ds-lg border border-ds-border bg-ds-bg/40 p-4 shadow-ds-soft backdrop-blur-[10px]">
            <div className="mb-3 h-3 w-16 animate-pulse rounded bg-ds-border" />
            <div className="mb-3 h-2 w-full animate-pulse rounded-full bg-ds-border" />
            <div className="aspect-video w-full animate-pulse rounded-ds-sm bg-ds-border" />
            <div className="mt-4 h-4 w-3/4 animate-pulse rounded bg-ds-border" />
            <div className="mt-2 h-3 w-full animate-pulse rounded bg-ds-border" />
          </div>
        </section>

        {/* Mindmap — zigzag mờ */}
        <section className="order-2 flex min-h-[280px] min-w-0 flex-1 flex-col lg:order-none lg:min-h-0">
          <div className="flex h-full min-h-0 flex-col rounded-ds-lg border border-ds-border bg-ds-bg/40 p-4 shadow-ds-soft backdrop-blur-[10px]">
            <div className="mb-4 h-3 w-28 animate-pulse rounded bg-ds-border" />
            <div className="relative min-h-[200px] flex-1 overflow-hidden rounded-ds-sm border border-ds-border bg-ds-bg/20">
              <svg
                className="pointer-events-none absolute inset-0 h-full w-full text-ds-border opacity-[0.22]"
                viewBox="0 0 400 220"
                preserveAspectRatio="none"
                aria-hidden
              >
                <g fill="none" stroke="currentColor" strokeWidth="1">
                  {ZIG_Y.map((y) => (
                    <path key={y} d={horizontalZigzag(y)} vectorEffect="non-scaling-stroke" />
                  ))}
                </g>
              </svg>
              <div className="absolute inset-0 animate-pulse bg-ds-border/10" aria-hidden />
              <div className="absolute inset-0 flex items-center justify-center p-6">
                <div className="flex w-full max-w-sm flex-col gap-3">
                  <div className="mx-auto h-14 w-14 animate-pulse rounded-full bg-ds-border" />
                  <div className="h-3 w-full animate-pulse rounded bg-ds-border" />
                  <div className="ml-8 h-3 w-4/5 animate-pulse rounded bg-ds-border" />
                  <div className="mr-6 h-3 w-3/5 animate-pulse rounded bg-ds-border" />
                </div>
              </div>
            </div>
            <div className="mt-4 space-y-2 border-t border-ds-border pt-4">
              <div className="h-3 w-32 animate-pulse rounded bg-ds-border" />
              <div className="h-10 w-full animate-pulse rounded-ds-sm bg-ds-border" />
              <div className="h-10 w-full animate-pulse rounded-ds-sm bg-ds-border" />
            </div>
          </div>
        </section>

        {/* Tutor */}
        <section className="order-3 w-full min-w-0 shrink-0 lg:order-none lg:w-[26%]">
          <div className="flex h-full min-h-[240px] flex-col rounded-ds-lg border border-ds-border bg-ds-bg/40 shadow-ds-soft backdrop-blur-[10px]">
            <div className="space-y-3 border-b border-ds-border p-4">
              <div className="h-4 w-2/3 animate-pulse rounded bg-ds-border" />
              <div className="h-3 w-full animate-pulse rounded bg-ds-border" />
              <div className="h-3 w-5/6 animate-pulse rounded bg-ds-border" />
              <div className="h-9 w-full animate-pulse rounded-ds-sm bg-ds-border" />
            </div>
            <div className="flex flex-1 flex-col p-4">
              <div className="h-3 w-24 animate-pulse rounded bg-ds-border" />
              <div className="mt-4 min-h-[120px] flex-1 animate-pulse rounded-ds-sm bg-ds-border" />
              <div className="mt-4 h-10 w-full animate-pulse rounded-ds-sm bg-ds-border" />
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
