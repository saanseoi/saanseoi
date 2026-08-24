import type { ApiProfileName as CoreApiProfileName } from '@repo/core/apiLocales'

export type ApiProfileName = CoreApiProfileName

export type OpenApiSchema = {
  $ref?: string
  additionalProperties?: boolean | OpenApiSchema
  allOf?: OpenApiSchema[]
  anyOf?: OpenApiSchema[]
  const?: string | number | boolean | null
  description?: string
  enum?: Array<string | number | boolean | null>
  format?: string
  items?: OpenApiSchema
  maxLength?: number
  minLength?: number
  nullable?: boolean
  oneOf?: OpenApiSchema[]
  pattern?: string
  properties?: Record<string, OpenApiSchema>
  required?: string[]
  type?: string | string[]
  'x-additionalPropertiesName'?: string
  'x-recordKeyName'?: string
}

export type OpenApiDocument = {
  components?: {
    schemas?: Record<string, OpenApiSchema>
  }
}

export type ReleaseSchemaModel = {
  name: string
  schema: OpenApiSchema
  schemas: Record<string, OpenApiSchema>
}
