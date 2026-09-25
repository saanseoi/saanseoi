export type MetaTranslation = {
  name: string
  nameShort?: string | null
  descriptionShort?: string | null
  description?: string | null
}

/** Locale-keyed translations stored on metadata records. */
export type MetaTranslations = Record<string, MetaTranslation>
