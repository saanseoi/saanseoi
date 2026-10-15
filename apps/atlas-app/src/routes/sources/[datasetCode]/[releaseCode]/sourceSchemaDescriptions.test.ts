import { readFileSync, readdirSync } from 'node:fs'
import { describe, expect, test } from 'bun:test'
import {
  overtureSourceRecordSchemas,
  resolveOvertureSourceRecordFieldDefinition,
  retainedSourceSchema,
  sourceRecordRawPropertyFields,
} from '@repo/core/sourceRecordSchemas'
import type { OpenApiSchema } from '#lib/bits/pages/docs/components/releaseSchema/releaseSchema.types.js'
import { protomapsSourceFields } from '../../../../../../atlas-api/src/services/protomapsSourceSchema'
import { saanseoiDivisionSourceFields } from '../../../../../../atlas-api/src/services/saanseoiDivisionSourceSchema'
import {
  datasetFields,
  planningUnitFields,
  sourceRecordFieldDescription,
} from './sourceRecordFieldDescriptions'
import { describeSourceSchema } from './sourceSchemaDescriptions'
import translations from './sourceFieldTranslations.json'

const locales = ['en', 'zh-Hant', 'zh-Hans'] as const
function verify(schema: OpenApiSchema, locale: string, path: string) {
  expect(schema.description?.trim(), path).toBeTruthy()
  if (locale !== 'en') expect(schema.description, path).toMatch(/[\u3400-\u9fff]/)
  for (const [name, child] of Object.entries(schema.properties ?? {}))
    verify(child, locale, `${path}.${name}`)
  if (schema.items) verify(schema.items, locale, `${path}[]`)
  if (typeof schema.additionalProperties === 'object')
    verify(schema.additionalProperties, locale, `${path}.*`)
  for (const key of ['allOf', 'anyOf', 'oneOf'] as const)
    for (const child of schema[key] ?? []) verify(child, locale, path)
}

describe.each(locales)('source schema descriptions in %s', locale => {
  test('localises all publisher field dictionaries using retained names', () => {
    for (const [dataset, fields] of Object.entries(datasetFields))
      for (const field of Object.keys(fields))
        verify(
          {
            description: sourceRecordFieldDescription(
              `dr-hk-${dataset}-2021`,
              field,
              locale,
            ),
          },
          locale,
          `${dataset}.${field}`,
        )
    for (const year of ['2001', '2006', '2011', '2016', '2021'])
      for (const kind of ['division', 'division-area'])
        for (const field of Object.keys(planningUnitFields))
          verify(
            {
              description: sourceRecordFieldDescription(
                `dr-hk-hkgov-pland-${kind}-pu-${year}`,
                field,
                locale,
              ),
            },
            locale,
            field,
          )
  })

  test('defines population and household district identifiers and names', () => {
    for (const version of ['2024', '2026-Q2']) {
      const release = `dr-hk-hkgov-censtatd-division-statistic-population-households-district-${version}`
      for (const field of ['dc', 'dcClass', 'dcEn', 'dcZhHant', 'year'])
        verify(
          { description: sourceRecordFieldDescription(release, field, locale) },
          locale,
          `${release}.${field}`,
        )
      expect(sourceRecordFieldDescription(release, 'dcClass', locale)).toContain('A')
      expect(sourceRecordFieldDescription(release, 'dcClass', locale)).toContain('T')
    }
  })

  test('defines all six district living-quarters fields', () => {
    const release =
      'dr-hk-hkgov-censtatd-division-statistic-permanent-living-quarters-district-2023-H2'
    for (const field of ['dc', 'dcEn', 'dcZhHant', 'lq', 'quarter', 'year'])
      verify(
        { description: sourceRecordFieldDescription(release, field, locale) },
        locale,
        field,
      )
    expect(sourceRecordFieldDescription(release, 'lq', locale)).toContain(
      locale === 'en'
        ? 'living quarter'
        : locale === 'zh-Hant'
          ? '居住屋宇單位'
          : '居住屋宇单位',
    )
  })

  test('defines every field and nested value in every Overture contract', () => {
    for (const schema of overtureSourceRecordSchemas)
      for (const field of sourceRecordRawPropertyFields(schema)) {
        const definition =
          resolveOvertureSourceRecordFieldDefinition(schema, field) ?? {}
        verify(
          describeSourceSchema(retainedSourceSchema(definition), locale, field.name),
          locale,
          `${schema.id}.${field.name}`,
        )
      }
  })

  test('defines curated and Protomaps nested fields including locale metadata', () => {
    for (const [source, fields] of Object.entries({
      saanseoi: saanseoiDivisionSourceFields,
      protomaps: protomapsSourceFields,
    }))
      for (const [name, schema] of Object.entries(fields))
        verify(describeSourceSchema(schema, locale, name), locale, `${source}.${name}`)
  })

  test('describes address components and both language forms', () => {
    const release = 'dr-hk-hkgov-dpo-address-2026-07-22.0'
    for (const field of [
      'address3d',
      'blockDescriptor',
      'blockDescriptorPrecedenceIndicator',
      'blockNo',
      'buildingName',
      'district',
      'estateName',
      'phaseName',
      'phaseNo',
      'region',
      'streetLocationName',
      'streetName',
      'streetNumberFrom',
      'streetNumberTo',
      'villageLocationName',
      'villageName',
      'villageNumberFrom',
      'villageNumberTo',
    ])
      for (const suffix of ['En', 'ZhHant'])
        verify(
          {
            description: sourceRecordFieldDescription(release, field + suffix, locale),
          },
          locale,
          field + suffix,
        )
    for (const field of ['easting', 'northing', 'geoAddress', 'hkgovCsuId'])
      verify(
        { description: sourceRecordFieldDescription(release, field, locale) },
        locale,
        field,
      )
  })

  test('matches both Planning New Town release namespaces', () => {
    for (const kind of ['division', 'division-area'])
      for (const field of ['newTownEn', 'newTownZhHant', 'newTownZhHans'])
        verify(
          {
            description: sourceRecordFieldDescription(
              `dr-hk-hkgov-pland-${kind}-new-town-2021`,
              field,
              locale,
            ),
          },
          locale,
          field,
        )
  })
})

test('every translated definition has all three locale values', () => {
  for (const [english, definitions] of Object.entries(translations)) {
    expect(definitions.en).toBe(english)
    for (const locale of ['zh-hant', 'zh-hans'] as const)
      expect(definitions[locale], english).toMatch(/[\u3400-\u9fff]/)
  }
})

test('descriptions preserve schema constraints and do not mutate shared definitions', () => {
  const schema: OpenApiSchema = {
    type: 'object',
    required: ['names'],
    nullable: true,
    properties: {
      names: {
        type: 'array',
        description: 'Names of the feature.',
        items: { type: 'string', minLength: 1 },
      },
    },
  }
  const before = structuredClone(schema)
  const described = describeSourceSchema(schema, 'zh-Hant')
  expect(schema).toEqual(before)
  expect(described.required).toEqual(['names'])
  expect(described.nullable).toBe(true)
  expect(described.properties?.names.items?.minLength).toBe(1)
  expect(described.properties?.names.items?.description).toContain('名稱')
  expect(
    sourceRecordFieldDescription('dr-hk-unrelated-2026', 'dc', 'zh-Hant'),
  ).toBeUndefined()
})

test('all statistics source fields have definitions in every supported locale', () => {
  const directory = new URL(
    '../../../../../../../fixtures/meta/curations/hkgov-censtatd-statistics/',
    import.meta.url,
  )
  const files = readdirSync(directory).filter(name => name.endsWith('.json'))
  expect(files.length).toBeGreaterThan(0)
  for (const file of files) {
    const fixture = JSON.parse(readFileSync(new URL(file, directory), 'utf8')) as {
      fields: Array<{
        sourceField: string
        localisations: Array<{ locale: string; description: string }>
      }>
    }
    for (const field of fixture.fields)
      for (const locale of locales) {
        const definition = field.localisations.find(
          value => value.locale.toLowerCase() === locale.toLowerCase(),
        )
        verify(
          { description: definition?.description },
          locale,
          `${file}.${field.sourceField}`,
        )
      }
  }
})
