import type { I18nMeta } from '../../i18nMeta'

export type MetaTranslation = {
  meta?: I18nMeta<'name' | 'nameShort' | 'description' | 'descriptionShort'>
  name: string
  nameShort?: string | null
  descriptionShort?: string | null
  description?: string | null
}

/** Locale-keyed translations stored on metadata records. */
export type MetaTranslations = Record<string, MetaTranslation>
