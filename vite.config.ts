import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

const apiProxyTarget = process.env.CASHLOG_API_PROXY_TARGET?.trim() || 'http://127.0.0.1:3000'
const productAnalyzerProxyTarget =
  process.env.PRODUCT_ANALYZER_PROXY_TARGET?.trim() ||
  process.env.CATAI_DEV_PROXY_TARGET?.trim() ||
  'http://127.0.0.1:8010'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        main: 'index.html',
        reservation: 'reservation.html',
      },
    },
  },
  server: {
    // localhost만 열려 있으면 같은 네트워크 폰 브라우저에서 접속 불가 → host: true
    host: true,
    proxy: {
      '/api/analyze-image': {
        target: productAnalyzerProxyTarget,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
      '/api': { target: apiProxyTarget, changeOrigin: true },
    },
  },
  preview: {
    host: true,
  },
  test: {
    environment: 'jsdom',
    setupFiles: './src/setupTests.ts',
  },
})
