import { create } from 'zustand'

/** Global UI preferences (persist to Supabase later). */
type AppPreferences = {
  summaryLength: 'short' | 'medium' | 'long'
  quizDifficulty: 'easy' | 'medium' | 'hard'
  setSummaryLength: (v: AppPreferences['summaryLength']) => void
  setQuizDifficulty: (v: AppPreferences['quizDifficulty']) => void
}

export const useAppStore = create<AppPreferences>((set) => ({
  summaryLength: 'medium',
  quizDifficulty: 'medium',
  setSummaryLength: (summaryLength) => set({ summaryLength }),
  setQuizDifficulty: (quizDifficulty) => set({ quizDifficulty }),
}))
