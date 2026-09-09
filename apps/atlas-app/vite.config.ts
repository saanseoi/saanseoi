import adapter from '@sveltejs/adapter-cloudflare'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { defineConfig } from 'vitest/config'
import { playwright } from '@vitest/browser-playwright'
import tailwindcss from '@tailwindcss/vite'
import { paraglideVitePlugin } from '@inlang/paraglide-js'
import { sveltekit } from '@sveltejs/kit/vite'

function atlasAdapter(options: Parameters<typeof adapter>[0]) {
  const cloudflareAdapter = adapter(options)

  // SvelteKit 3 delivers `event.platform` through the adapter emulator in dev.
  // The current Cloudflare adapter prerelease initialises the platform proxy but
  // does not yet expose that hook.
  cloudflareAdapter.emulate = () => ({
    platform: () =>
      (
        globalThis as typeof globalThis & {
          __sveltekit_cloudflare_platform?: App.Platform
        }
      ).__sveltekit_cloudflare_platform as App.Platform,
  })

  return cloudflareAdapter
}

export default defineConfig({
  plugins: [
    tailwindcss(),
    paraglideVitePlugin({
      project: resolve(import.meta.dirname, '../../libs/i18n/project.inlang'),
      outdir: resolve(import.meta.dirname, '../../libs/i18n/src/paraglide'),
      emitTsDeclarations: true,
      outputStructure: 'locale-modules',
    }),
    sveltekit({
      compilerOptions: {
        experimental: { async: true },
        // Force runes mode for the project, except for libraries. Can be removed in svelte 6.
        runes: ({ filename }) =>
          filename.split(/[/\\]/).includes('node_modules') ? undefined : true,
      },

      adapter: atlasAdapter({
        platformProxy: {
          // Share the same Miniflare state as the local API/workers stack and migration scripts.
          configPath: resolve(import.meta.dirname, 'wrangler.jsonc'),

          // Wrangler appends `v3` to its --persist-to root; getPlatformProxy passes
          // this path directly to Miniflare. Point at Wrangler's effective store.
          persist: { path: resolve(import.meta.dirname, '../../.local/d1/dev/v3') },
          envFiles: ['.dev.vars'],
          // Local development shares persisted Miniflare/D1 state with the API.
          // Opt in only when a flow needs a real remote binding (for example, email).
          remoteBindings: process.env.ATLAS_REMOTE_BINDINGS === 'true',
        },
      }),
      experimental: {
        explicitEnvironmentVariables: true,
        remoteFunctions: true,
      },
    }),
    {
      name: 'atlas-vitest-sveltekit-server',
      async configResolved(config) {
        if (process.env.VITEST !== 'true') return

        const kitInternals = resolve(
          import.meta.dirname,
          '../../node_modules/@sveltejs/kit/src',
        )
        const [{ extract_svelte_config }, { write_server }] = await Promise.all([
          import(pathToFileURL(resolve(kitInternals, 'core/config/index.js')).href),
          import(
            pathToFileURL(resolve(kitInternals, 'core/sync/write_server.js')).href
          ),
        ])
        const kitConfig = extract_svelte_config(config)
        write_server(kitConfig, resolve(kitConfig.outDir, 'generated/dev'), config.root)
      },
    },
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
      // form a reload loop when polling is enabled. Paraglide output remains
      // watched so its generated modules can invalidate the app graph.
      ignored: [
        '**/.git/**',
        '**/node_modules/**',
        '**/.svelte-kit/**',
        '**/.local/**',
        '**/.turbo/**',
      ],
    },
  },
  optimizeDeps: {
    // MapLibre v6 resolves its worker relative to import.meta.url. Pre-bundling
    // the Svelte wrapper changes that URL without emitting the worker alongside it.
    exclude: ['@tailwindcss/vite', 'maplibre-gl', 'svelte-maplibre-gl'],
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
          setupFiles: ['./browser.setup.ts'],
          browser: {
            enabled: true,
            viewport: { width: 1280, height: 900 },
            // Share installed Chrome locally; CI uses its pinned Playwright browser.
            provider: playwright({
              launchOptions: {
                channel:
                  process.env.PLAYWRIGHT_CHROMIUM_CHANNEL ||
                  (process.env.CI ? undefined : 'chrome'),
              },
            }),
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
