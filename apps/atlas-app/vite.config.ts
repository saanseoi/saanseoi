import { defineConfig } from 'vitest/config'
import { playwright } from '@vitest/browser-playwright'
import tailwindcss from '@tailwindcss/vite'
import { sveltekit } from '@sveltejs/kit/vite'

export default defineConfig({
  plugins: [tailwindcss(), sveltekit()],
  server: {
    // Tailnet-only remote development through `tailscale serve --https=8443`.
    // Vite otherwise rejects the MagicDNS Host header before proxying/HMR.
    allowedHosts: ['fi.tailb49776.ts.net'],
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
  resolve: {
    // Scalar ships several Vue-based packages. Some of them contain a nested
    // Vue version, which must resolve to the app runtime or components fail
    // with `currentRenderingInstance is null` during drawer updates.
    dedupe: ['vue'],
  },
  define: {
    __VUE_OPTIONS_API__: true,
    __VUE_PROD_DEVTOOLS__: false,
    __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: false,
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
