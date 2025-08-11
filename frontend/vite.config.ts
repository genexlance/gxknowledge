import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8888', // Netlify dev server
        rewrite: (path) => path.replace(/^\/api/, '/.netlify/functions'),
        changeOrigin: true,
      },
    },
  },
})
