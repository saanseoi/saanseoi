import adapter from '@sveltejs/adapter-cloudflare'
import { resolve } from 'node:path'

/** @type {import('@sveltejs/kit').Config} */
const config = {
  compilerOptions: {
    experimental: {
      async: true,
    },
    // Force runes mode for the project, except for libraries. Can be removed in svelte 6.
    runes: ({ filename }) =>
      filename.split(/[/\\]/).includes('node_modules') ? undefined : true,
  },
  kit: {
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
      remoteFunctions: true,
    },
    typescript: {
      config: config => ({
        ...config,
        include: [...config.include, '../drizzle.config.ts'],
      }),
    },
  },
}

export default config
