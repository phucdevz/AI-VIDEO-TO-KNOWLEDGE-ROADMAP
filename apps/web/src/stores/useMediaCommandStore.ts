import { create } from 'zustand'

/**
 * Xung từ Command Palette (/play, /mute) — WorkspaceVideoPanel lắng nghe và cập nhật ReactPlayer.
 */
type MediaCommandState = {
  playPulse: number
  mutePulse: number
  requestPlay: () => void
  requestMuteToggle: () => void
}

export const useMediaCommandStore = create<MediaCommandState>((set) => ({
  playPulse: 0,
  mutePulse: 0,
  requestPlay: () => set((s) => ({ playPulse: s.playPulse + 1 })),
  requestMuteToggle: () => set((s) => ({ mutePulse: s.mutePulse + 1 })),
}))
