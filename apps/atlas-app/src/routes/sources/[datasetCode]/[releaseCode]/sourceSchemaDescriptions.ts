import { retainedPropertyName } from '@repo/core/sourceRecordSchemas'
import type { OpenApiSchema } from '#lib/bits/pages/docs/components/releaseSchema/releaseSchema.types.js'
import meanings from './sourceFieldMeanings.json'
import translations from './sourceFieldTranslations.json'

type Locale = 'en' | 'zh-hant' | 'zh-hans'
const copy: Record<string, Record<string, string>> = translations
const fields: Record<string, Record<string, string>> = meanings

/** Annotate a copy: types, presence, dictionary keys and source values stay intact. */
export function describeSourceSchema<T extends OpenApiSchema>(
  schema: T,
  locale: string,
  field?: string,
  inheritedDescription?: string,
): T {
  const language = locale.toLowerCase() as Locale
  const description = schema.description
    ? (copy[schema.description]?.[language] ?? schema.description)
    : ((field ? fields[retainedPropertyName(field)]?.[language] : undefined) ??
      inheritedDescription)
  const result: OpenApiSchema = { ...schema, ...(description ? { description } : {}) }
  if (schema.properties) {
    result.properties = Object.fromEntries(
      Object.entries(schema.properties).map(([name, child]) => [
        name,
        describeSourceSchema(child, locale, name),
      ]),
    )
  }
  if (schema.items)
    result.items = describeSourceSchema(schema.items, locale, undefined, description)
  if (typeof schema.additionalProperties === 'object')
    result.additionalProperties = describeSourceSchema(
      schema.additionalProperties,
      locale,
      undefined,
      description,
    )
  for (const key of ['allOf', 'anyOf', 'oneOf'] as const) {
    if (schema[key])
      result[key] = schema[key].map(child =>
        describeSourceSchema(child, locale, field, description),
      )
  }
  return result as T
}
