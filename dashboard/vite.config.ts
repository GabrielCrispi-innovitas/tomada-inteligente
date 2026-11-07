/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base './' -> funciona no GitHub Pages (subpasta) e abrindo o build localmente.
export default defineConfig({
  base: './',
  plugins: [react()],
  server: { port: 5180, host: true },
  preview: { port: 5180 },
  build: {
    chunkSizeWarningLimit: 1200,
  },
  test: {
    environment: 'node',
  },
})
