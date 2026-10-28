import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        determinism: resolve(import.meta.dirname, 'determinism.html'),
      },
    },
  },
  test: {
    include: ['tests/**/*.test.ts'],
  },
})
