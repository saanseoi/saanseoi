import { getRequestEvent } from '$app/server'

// Vite runs SSR in Node. The Cloudflare adapter supplies the emulated bindings
// per request; defer access until then so importing a server module is safe.
const getPlatform = () => {
  const platform = getRequestEvent().platform as
    | { env: Env; ctx: ExecutionContext }
    | undefined
  if (!platform) throw new Error('Cloudflare platform is unavailable for this request')
  return platform
}

export const env = new Proxy({} as Env, {
  get: (_target, key) => Reflect.get(getPlatform().env, key),
  has: (_target, key) => Reflect.has(getPlatform().env, key),
  ownKeys: () => Reflect.ownKeys(getPlatform().env),
  getOwnPropertyDescriptor: (_target, key) => {
    const descriptor = Object.getOwnPropertyDescriptor(getPlatform().env, key)
    return descriptor ? { ...descriptor, configurable: true } : undefined
  },
})

export function waitUntil(promise: Promise<unknown>): void {
  getPlatform().ctx.waitUntil(promise)
}
