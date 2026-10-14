/** Origin of the current field value, independent of its language and review status. */
export const i18nOrigins = [
  'provided',
  'inferred',
  'ai-translated',
  'human-translated',
] as const
export type I18nOrigin = (typeof i18nOrigins)[number]
export type I18nFieldMeta = {
  origin: I18nOrigin
  /** Omission means that human verification is unknown. */
  isHumanVerified?: boolean
  /** Identity of the human or service that produced this translation. */
  translatorId?: string
}
export type I18nMeta<Field extends string = string> = {
  isLocaleInferred: boolean
  /** Omitted fields have unknown origin; absence never implies publisher-provided text. */
  fields?: Partial<Record<Field, I18nFieldMeta>>
}

/** Validate metadata at JSON and ingestion boundaries without discarding future field names. */
export function parseI18nMeta(value: unknown): I18nMeta {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid i18n meta')
  const row = value as Record<string, unknown>
  if (typeof row.isLocaleInferred !== 'boolean')
    throw new Error('Invalid i18n meta.isLocaleInferred')
  const meta: I18nMeta = { isLocaleInferred: row.isLocaleInferred }
  if (row.fields !== undefined) {
    if (!row.fields || typeof row.fields !== 'object' || Array.isArray(row.fields))
      throw new Error('Invalid i18n meta.fields')
    meta.fields = {}
    for (const [field, raw] of Object.entries(row.fields)) {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw))
        throw new Error(`Invalid i18n meta field ${field}`)
      const entry = raw as Record<string, unknown>
      if (!i18nOrigins.includes(entry.origin as I18nOrigin))
        throw new Error(`Invalid i18n origin for ${field}`)
      if (
        entry.isHumanVerified !== undefined &&
        typeof entry.isHumanVerified !== 'boolean'
      )
        throw new Error(`Invalid i18n verification for ${field}`)
      if (
        entry.translatorId !== undefined &&
        (typeof entry.translatorId !== 'string' || !entry.translatorId.trim())
      )
        throw new Error(`Invalid i18n translator for ${field}`)
      meta.fields[field] = {
        origin: entry.origin as I18nOrigin,
        ...(entry.isHumanVerified === undefined
          ? {}
          : { isHumanVerified: entry.isHumanVerified as boolean }),
        ...(entry.translatorId === undefined
          ? {}
          : { translatorId: entry.translatorId as string }),
      }
    }
  }
  return meta
}

/** Metadata for explicitly labelled publisher or authored fields. */
export function providedI18nMeta(fields: string[]): I18nMeta {
  return {
    isLocaleInferred: false,
    fields: Object.fromEntries(
      fields.map(field => [field, { origin: 'provided' as const }]),
    ),
  }
}
