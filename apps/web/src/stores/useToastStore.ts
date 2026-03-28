import { create } from 'zustand'

export type ToastVariant = 'default' | 'success' | 'error'

export type ToastItem = {
  id: string
  message: string
  variant: ToastVariant
}

type ToastState = {
  toasts: ToastItem[]
  pushToast: (message: string, variant?: ToastVariant) => void
  removeToast: (id: string) => void
}

let idCounter = 0

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  pushToast: (message, variant = 'default') => {
    const id = `toast-${++idCounter}-${Date.now()}`
    set((s) => ({ toasts: [...s.toasts, { id, message, variant }] }))
    window.setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
    }, 4200)
  },
  removeToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}))
