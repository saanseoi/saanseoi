import { defineConfig } from 'vitest/config'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [tailwindcss(), svelte()],
  server: { host: 'localhost', port: 5174, strictPort: true },
  preview: { port: 4173, strictPort: true },
  test: { environment: 'node' },
})
