import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    /** Ép pre-bundle ổn định; thiếu entry dễ gây 504 Outdated Optimize Dep sau khi đổi deps. */
    include: [
      '@xyflow/react',
      '@xyflow/system',
      'elkjs/lib/elk.bundled.js',
      'lucide-react',
      'react-hot-toast',
    ],
  },
})
