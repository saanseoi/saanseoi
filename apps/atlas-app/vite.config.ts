import adapter from '@sveltejs/adapter-cloudflare'
import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'
import { playwright } from '@vitest/browser-playwright'
import tailwindcss from '@tailwindcss/vite'
import { sveltekit } from '@sveltejs/kit/vite'

export default defineConfig({
  plugins: [
    tailwindcss(),
    sveltekit({
      compilerOptions: {
        experimental: { async: true },
        // Force runes mode for the project, except for libraries. Can be removed in svelte 6.
        runes: ({ filename }) =>
          filename.split(/[/\\]/).includes('node_modules') ? undefined : true,
      },

      adapter: adapter({
        platformProxy: {
          // Share the same Miniflare state as the local API/workers stack and migration scripts.
          configPath: resolve(import.meta.dirname, 'wrangler.jsonc'),

          // Wrangler appends `v3` to its --persist-to root; getPlatformProxy passes
          // this path directly to Miniflare. Point at Wrangler's effective store.
          persist: { path: resolve(import.meta.dirname, '../../.local/d1/dev/v3') },
          envFiles: ['.dev.vars'],
          remoteBindings: true,
        },
      }),
      experimental: {
        explicitEnvironmentVariables: true,
        remoteFunctions: true,
      },
    }),
  ],
  server: {
    // Tailnet-only remote development through `tailscale serve --https=8443`.
    // Vite otherwise rejects the MagicDNS Host header before proxying/HMR.
    allowedHosts: ['fi.tailb49776.ts.net'],
    watch: {
      usePolling: true,
      interval: 1000,
      // Do not let Vite observe its own dependency cache or SvelteKit's
      // generated output. Both are rewritten during a reload and otherwise
      // form a reload loop when polling is enabled.
      ignored: [
        '**/.git/**',
        '**/node_modules/**',
        '**/.svelte-kit/**',
        '**/.local/**',
        '**/.turbo/**',
        '**/libs/i18n/src/paraglide/**',
      ],
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
    noExternal: ['bits-ui', 'devalue', 'runed', 'svelte-toolbelt'],
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
