import { Bell } from 'lucide-react'

type AvatarWithNotificationBellProps = {
  displayName: string
  avatarUrl?: string | null
  initials: string
  /** Header: tròn 36px; Sidebar: vuông bo góc 40px */
  variant: 'header' | 'sidebar'
}

/**
 * Avatar + nút chuông thông báo góc phải trên (badge overlay).
 */
export function AvatarWithNotificationBell({
  displayName,
  avatarUrl,
  initials,
  variant,
}: AvatarWithNotificationBellProps) {
  const isHeader = variant === 'header'

  const frame = isHeader
    ? 'h-9 w-9 rounded-full border border-ds-border shadow-ds-soft'
    : 'h-10 w-10 rounded-ds-sm border border-ds-border shadow-ds-soft'

  const bellClass =
    'absolute -right-0.5 -top-0.5 z-10 flex h-5 w-5 items-center justify-center rounded-full border border-ds-border bg-ds-bg/95 text-ds-text-secondary shadow-md backdrop-blur-sm transition-colors hover:bg-ds-primary/15 hover:text-ds-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ds-secondary focus-visible:ring-offset-2 focus-visible:ring-offset-ds-bg'

  return (
    <div className="relative shrink-0">
      {avatarUrl ? (
        <img
          src={avatarUrl}
          alt={displayName}
          title={displayName}
          className={`${frame} bg-ds-bg object-cover`}
        />
      ) : (
        <div
          className={`flex items-center justify-center overflow-hidden bg-ds-bg/50 ${frame} ${
            isHeader ? 'text-xs font-bold text-ds-text-secondary' : 'text-sm font-bold text-ds-secondary'
          }`}
          title={displayName}
        >
          {initials}
        </div>
      )}
      <button type="button" className={bellClass} aria-label="Thông báo" title="Thông báo">
        <Bell className="h-3 w-3" strokeWidth={2} aria-hidden />
      </button>
    </div>
  )
}
