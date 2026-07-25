export type HarbourEnvironment = 'dev' | 'preview' | 'production'

const harbourBaseUrls: Record<HarbourEnvironment, string> = {
  dev: 'http://localhost:8788',
  preview: 'https://preview.harbour.saanseoi.hk',
  production: 'https://harbour.saanseoi.hk',
}

const atlasBaseUrls: Record<HarbourEnvironment, string> = {
  dev: 'http://localhost:8787',
  preview: 'https://preview.api.saanseoi.hk',
  production: 'https://api.saanseoi.hk',
}

export function normaliseBaseUrl(value: string) {
  return value.trim().replace(/\/+$/, '')
}

export function resolveHarbourBaseUrl(environment: HarbourEnvironment) {
  return harbourBaseUrls[environment]
}

export function resolveAtlasBaseUrl(environment: HarbourEnvironment) {
  return atlasBaseUrls[environment]
}
