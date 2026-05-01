import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // localhost만 열려 있으면 같은 네트워크 폰 브라우저에서 접속 불가 → host: true
    host: true,
  },
  preview: {
    host: true,
  },
  test: {
    environment: 'jsdom',
    setupFiles: './src/setupTests.ts',
  },
})
