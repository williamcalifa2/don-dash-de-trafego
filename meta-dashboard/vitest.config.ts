import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname) } },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Nenhum teste pode falar com a Meta de verdade.
    setupFiles: ['tests/setup.ts'],
  },
})
