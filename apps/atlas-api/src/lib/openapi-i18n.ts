import enMessages from '@repo/i18n/messages/en/shared.json'
import zhHansMessages from '@repo/i18n/messages/zh-Hans/shared.json'
import zhHantMessages from '@repo/i18n/messages/zh-Hant/shared.json'

export type OpenApiLocale = 'en' | 'zh-Hant' | 'zh-Hans'

type OpenApiMessageKey = Extract<keyof typeof enMessages, `openapi_${string}`>
type OpenApiMessageInputs = Record<string, number | string>

const messages: Record<OpenApiLocale, Record<OpenApiMessageKey, string>> = {
  en: enMessages,
  'zh-Hant': zhHantMessages,
  'zh-Hans': zhHansMessages,
} as Record<OpenApiLocale, Record<OpenApiMessageKey, string>>

const marker = '__saanseoi_openapi_i18n__'

export function openApiText(key: OpenApiMessageKey, inputs?: OpenApiMessageInputs) {
  return `${marker}${key}:${encodeURIComponent(JSON.stringify(inputs ?? {}))}`
}

function message(
  key: OpenApiMessageKey,
  locale: OpenApiLocale,
  inputs: OpenApiMessageInputs,
) {
  return messages[locale][key].replace(/\{(\w+)\}/g, (_, name: string) =>
    String(inputs[name] ?? `{${name}}`),
  )
}

function localiseString(value: string, locale: OpenApiLocale): string {
  return value.replace(
    /__saanseoi_openapi_i18n__(openapi_[a-z0-9_]+):([^\s]+)/g,
    (token, key: OpenApiMessageKey, encodedInputs: string) => {
      try {
        return message(
          key,
          locale,
          JSON.parse(decodeURIComponent(encodedInputs)) as OpenApiMessageInputs,
        )
      } catch {
        return token
      }
    },
  )
}

export function localiseOpenApiDocument<T>(document: T, locale: OpenApiLocale): T {
  if (typeof document === 'string') return localiseString(document, locale) as T
  if (Array.isArray(document)) {
    return document.map(value => localiseOpenApiDocument(value, locale)) as T
  }
  if (document === null || typeof document !== 'object') return document

  return Object.fromEntries(
    Object.entries(document).map(([key, value]) => [
      key,
      localiseOpenApiDocument(value, locale),
    ]),
  ) as T
}

export function resolveOpenApiLocale(
  requestedLocale: string | undefined,
  acceptLanguage: string | undefined,
): OpenApiLocale {
  const requested = requestedLocale?.trim().toLowerCase()
  if (requested === 'zh-hant') return 'zh-Hant'
  if (requested === 'zh-hans') return 'zh-Hans'
  if (requested === 'en') return 'en'

  const accepted = acceptLanguage?.toLowerCase() ?? ''
  if (accepted.includes('zh-hant') || accepted.includes('zh-tw')) return 'zh-Hant'
  if (accepted.includes('zh-hans') || accepted.includes('zh-cn')) return 'zh-Hans'
  return 'en'
}
