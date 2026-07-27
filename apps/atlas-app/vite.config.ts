import { defineConfig } from 'vitest/config'
import { playwright } from '@vitest/browser-playwright'
import tailwindcss from '@tailwindcss/vite'
import { sveltekit } from '@sveltejs/kit/vite'

export default defineConfig({
  plugins: [tailwindcss(), sveltekit()],
  server: {
    watch: {
      usePolling: true,
      interval: 1000,
      ignored: ['!**/src/**/*.{js,ts,jsx,tsx}'],
    },
  },
  optimizeDeps: {
    // MapLibre v6 resolves its worker relative to import.meta.url. Pre-bundling
    // the Svelte wrapper changes that URL without emitting the worker alongside it.
    exclude: ['@tailwindcss/vite', 'maplibre-gl', 'svelte-maplibre-gl'],
    force: true,
  },
  ssr: {
    noExternal: ['bits-ui', 'runed', 'svelte-toolbelt'],
  },
  test: {
    expect: { requireAssertions: true },
    projects: [
      {
        extends: './vite.config.ts',
        test: {
          name: 'client',
          browser: {
            enabled: true,
            provider: playwright(),
            instances: [{ browser: 'chromium', headless: true }],
          },
          include: ['src/**/*.svelte.{test,spec}.{js,ts}'],
          exclude: ['src/lib/server/**'],
        },
      },

      {
        extends: './vite.config.ts',
        test: {
          name: 'server',
          environment: 'node',
          include: ['src/**/*.{test,spec}.{js,ts}'],
          exclude: ['src/**/*.svelte.{test,spec}.{js,ts}'],
        },
      },
    ],
  },
})
