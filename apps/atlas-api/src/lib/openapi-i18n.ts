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

const generatedDescriptionKeys: Record<string, OpenApiMessageKey> = {
  'Integer numbers.': 'openapi_integer_description',
  'A unique identifier with no whitespace characters.':
    'openapi_unique_identifier_description',
  'the date-time notation as defined by RFC 3339, section 5.6, for example, 2017-07-21T17:32:28Z':
    'openapi_date_time_description',
}

export function openApiText(key: OpenApiMessageKey, inputs?: OpenApiMessageInputs) {
  return `${marker}${key}:${encodeURIComponent(JSON.stringify(inputs ?? {}))}`
}

function message(
  key: OpenApiMessageKey,
  locale: OpenApiLocale,
  inputs: OpenApiMessageInputs,
) {
  const resolvedInputs = Object.fromEntries(
    Object.entries(inputs).map(([name, value]) => [
      name,
      typeof value === 'string' ? localiseString(value, locale) : value,
    ]),
  )

  return messages[locale][key].replace(/\{(\w+)\}/g, (_, name: string) =>
    String(resolvedInputs[name] ?? `{${name}}`),
  )
}

function localiseString(value: string, locale: OpenApiLocale): string {
  const generatedDescriptionKey = generatedDescriptionKeys[value]
  if (generatedDescriptionKey) {
    return message(generatedDescriptionKey, locale, {})
  }

  let localised = value
  for (let depth = 0; depth < 2; depth += 1) {
    const next = localised.replace(
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
    if (next === localised) {
      break
    }
    localised = next
  }

  return localised
}

function parameterDescription(
  parameter: Record<string, unknown>,
  locale: OpenApiLocale,
): string | undefined {
  if (
    typeof parameter.name !== 'string' ||
    typeof parameter.in !== 'string' ||
    parameter.description !== undefined ||
    parameter.schema === null ||
    typeof parameter.schema !== 'object' ||
    Array.isArray(parameter.schema)
  ) {
    return undefined
  }

  const schema = parameter.schema as Record<string, unknown>
  if (schema.format === 'date-time') {
    return message('openapi_date_time_description', locale, {})
  }

  if (
    schema.type === 'integer' ||
    (Array.isArray(schema.type) && schema.type.includes('integer'))
  ) {
    return message('openapi_integer_description', locale, {})
  }

  return undefined
}

export function localiseOpenApiDocument<T>(document: T, locale: OpenApiLocale): T {
  if (typeof document === 'string') return localiseString(document, locale) as T
  if (Array.isArray(document)) {
    return document.map(value => localiseOpenApiDocument(value, locale)) as T
  }
  if (document === null || typeof document !== 'object') return document

  const localised = Object.fromEntries(
    Object.entries(document).map(([key, value]) => [
      key,
      localiseOpenApiDocument(value, locale),
    ]),
  ) as Record<string, unknown>
  const description = parameterDescription(localised, locale)

  return (description === undefined ? localised : { ...localised, description }) as T
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
