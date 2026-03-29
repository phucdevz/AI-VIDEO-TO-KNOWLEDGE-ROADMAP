import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    /** Tránh lỗi "Outdated Optimize Dep" khi HMR/cập nhật @xyflow/react. */
    include: ['@xyflow/react', '@xyflow/system'],
  },
})
