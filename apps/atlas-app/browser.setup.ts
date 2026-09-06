// Component tests do not load SvelteKit's document bootstrap.
Object.assign(globalThis, {
  __sveltekit_dev: { env: { PUBLIC_ATLAS_API_BASE_URL: 'http://localhost:8787' } },
})
import './src/routes/app.css'
