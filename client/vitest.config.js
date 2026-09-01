import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./test/setup.js'],
    // Only our own tests — never walk into node_modules or a build output.
    include: ['test/**/*.test.{js,jsx}'],
    css: false,
  },
})
