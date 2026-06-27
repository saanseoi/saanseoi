export type HarbourEnvironment = 'dev' | 'preview' | 'production'

const harbourBaseUrls: Record<HarbourEnvironment, string> = {
  dev: 'http://localhost:8788',
  preview: 'https://preview.harbour.saanseoi.hk',
  production: 'https://harbour.saanseoi.hk',
}

export function normalizeBaseUrl(value: string) {
  return value.trim().replace(/\/+$/, '')
}

export function resolveHarbourBaseUrl(environment: HarbourEnvironment) {
  return harbourBaseUrls[environment]
}
