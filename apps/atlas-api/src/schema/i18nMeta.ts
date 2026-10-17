import { z } from '@hono/zod-openapi'
import { i18nOrigins } from '@repo/db'

export const I18nFieldMetaSchema = z
  .object({
    origin: z.enum(i18nOrigins).openapi({
      description:
        'Origin of this field value, independent of its language and verification status.',
    }),
    isHumanVerified: z.boolean().optional().openapi({
      description:
        'Whether a human verified the current value. Omission means unknown.',
    }),
    translatorId: z.string().min(1).optional().openapi({
      description: 'Identity of the human or service that produced this translation.',
    }),
  })
  .openapi('I18nFieldMeta')

export const I18nMetaSchema = z
  .object({
    isLocaleInferred: z.literal(true).optional().openapi({
      description: 'Present only when the locale was inferred. Omission means false.',
    }),
    fields: z.record(z.string(), I18nFieldMetaSchema.optional()).optional().openapi({
      description:
        'Metadata keyed by the localised field name. Omitted fields have unknown origin.',
    }),
  })
  .nullable()
  .openapi('I18nMeta')
