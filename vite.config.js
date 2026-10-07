import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: './',  // Electron loads from file:// so paths must be relative
  server: {
    allowedHosts: ['pos.vavoom.io'],
  },
})
