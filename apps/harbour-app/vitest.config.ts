import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'
import { svelte } from '@sveltejs/vite-plugin-svelte'

export default defineConfig({
  plugins: [svelte()],
  resolve: {
    alias: [
      {
        find: '#lib/bits/internal/i18n.js',
        replacement: resolve(import.meta.dirname, '../../libs/i18n/src/messages.ts'),
      },
      {
        find: '#lib',
        replacement: resolve(import.meta.dirname, '../atlas-app/src/lib'),
      },
    ],
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts', 'src/**/*.test.ts'],
  },
})
