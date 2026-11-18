import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [react()],
  // harfbuzzjs loads its wasm via new URL(..., import.meta.url) and uses top-level await
  optimizeDeps: { exclude: ['harfbuzzjs'] },
  build: { target: 'es2022' },
  test: {
    include: ['src/**/*.test.ts'],
  },
})
