import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { getProductAnalyzerConfig } from './server/productAnalyzerGateway'

const apiProxyTarget = process.env.CASHLOG_API_PROXY_TARGET?.trim() || 'http://127.0.0.1:3000'
const productAnalyzerProxyTarget =
  process.env.PRODUCT_ANALYZER_PROXY_TARGET?.trim() ||
  process.env.CATAI_DEV_PROXY_TARGET?.trim() ||
  'http://127.0.0.1:8010'
const productAnalyzerHeaders = getProductAnalyzerConfig().headers

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    // The optional Three.js pet renderer is isolated and loaded only after opening the pet tab.
    chunkSizeWarningLimit: 550,
    rollupOptions: {
      input: {
        main: 'index.html',
        reservation: 'reservation.html',
        privacy: 'privacy.html',
        signup: 'signup.html',
        login: 'login.html',
        profile: 'profile.html',
        forgotPassword: 'forgot-password.html',
        resetPassword: 'reset-password.html',
        terms: 'terms.html',
        notFound: '404.html',
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
        headers: productAnalyzerHeaders,
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
