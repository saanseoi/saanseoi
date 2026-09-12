import { vi } from 'vitest'

// Component tests have no SvelteKit server to execute remote commands.
vi.mock('#lib/locale.remote.js', () => ({
  setUserLocale: vi.fn().mockResolvedValue(undefined),
}))

// Component tests do not load SvelteKit's document bootstrap.
Object.assign(globalThis, {
  __sveltekit_dev: { env: { PUBLIC_ATLAS_API_BASE_URL: 'http://localhost:8787' } },
})
import './src/routes/app.css'
