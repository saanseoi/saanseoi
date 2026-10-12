import { z } from '@hono/zod-openapi'
import { openApiText } from '../lib/openapi-i18n'

const IdentifierValueSchema = z
  .union([z.string(), z.number(), z.array(z.union([z.string(), z.number()]))])
  .openapi({
    description: openApiText('openapi_identifier_type_description'),
  })

export const IdentifiersSchema = z
  .record(
    z.string().regex(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/),
    z.record(z.string().regex(/^[a-z][a-zA-Z0-9]*$/), IdentifierValueSchema).openapi({
      'x-additionalPropertiesName': openApiText('openapi_identifier_type_label'),
      description: openApiText('openapi_identifier_publisher_description'),
    }),
  )
  .openapi('Identifiers', {
    'x-additionalPropertiesName': openApiText('openapi_identifier_publisher_label'),
  })
