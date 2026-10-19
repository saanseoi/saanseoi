import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import tailwindcss from '@tailwindcss/vite'
import { paraglideVitePlugin } from '@inlang/paraglide-js'
import { addressInputsPlugin } from './addressInputsPlugin.ts'
import { ingestionPlugin } from './ingestionPlugin.ts'
import { reviewInputsPlugin } from './reviewInputsPlugin.ts'

export default defineConfig({
  appType: 'mpa',
  plugins: [
    paraglideVitePlugin({
      project: resolve(import.meta.dirname, '../../libs/i18n/project.inlang'),
      outdir: resolve(import.meta.dirname, '../../libs/i18n/src/paraglide'),
      emitTsDeclarations: true,
      outputStructure: 'locale-modules',
    }),
    svelte(),
    tailwindcss(),
    ingestionPlugin(),
    addressInputsPlugin(),
    reviewInputsPlugin(),
  ],
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
  optimizeDeps: { exclude: ['maplibre-gl'] },
  server: {
    host: 'localhost',
    allowedHosts: ['review.localhost'],
    port: 5185,
    strictPort: true,
    fs: { allow: [resolve(import.meta.dirname, '../..')] },
  },
  build: {
    rolldownOptions: {
      input: [
        'index.html',
        'divisions/index.html',
        'ingestion/index.html',
        'addresses/index.html',
      ],
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts', 'src/**/*.test.ts'],
  },
})
