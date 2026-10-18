import { expect, test } from 'bun:test'
import { listApiFieldFixtures } from '../../../../libs/db/src/apiFieldFixtures'
import { compileAuthoringFieldLineage } from '../../../../libs/db/src/fieldLineageAuthoring'
import { AddressDetailResponseSchema } from '../schema/addresses'
import {
  DivisionResourceSchema,
  DivisionGeometryResourceSchema,
} from '../schema/divisions'
import { PlacesListResponseSchema } from '../schema/places'
import { StatisticDetailResponseSchema } from '../schema/statistics'

const contracts = {
  address: AddressDetailResponseSchema.shape.data,
  division: DivisionResourceSchema,
  divisionArea: DivisionGeometryResourceSchema.options[0],
  divisionBoundary: DivisionGeometryResourceSchema.options[1],
  place: PlacesListResponseSchema.shape.data.element,
  statistic: StatisticDetailResponseSchema.shape.data,
}

for (const fixture of listApiFieldFixtures()) {
  test(`response schema coverage ${fixture.apiVersion}/${fixture.domainCode}/${fixture.mappingVersion}`, () => {
    const selections = [
      fixture,
      ...fixture.sourceCompositions.map(composition => ({
        ...fixture,
        fields: fixture.fields.filter(field =>
          composition.datasetCodes.includes(field.sourceDatasetCode),
        ),
      })),
    ]
    for (const selected of selections)
      for (const { definition } of compileAuthoringFieldLineage(selected)) {
        const resource = definition.fields[0]!.resourceType
        const schema = contracts[resource as keyof typeof contracts]
        // Included statistic-field definitions have a separate dynamic registry contract.
        if (!schema) continue
        const shape = schema.shape
        const attributes = Object.keys(shape.attributes.shape).map(
          key => `attributes.${key}`,
        )
        const relationships =
          'relationships' in shape
            ? Object.keys(shape.relationships.shape).map(key => `relationships.${key}`)
            : []
        const expected = ['id', ...attributes, ...relationships]
        const fields = definition.fields.map(field => field.apiField)
        for (const path of expected)
          expect(
            fields.some(field => field === path || field.startsWith(`${path}.`)),
            `${resource}.${path}`,
          ).toBe(true)
        for (const field of definition.fields) {
          expect(
            expected.some(
              path => field.apiField === path || field.apiField.startsWith(`${path}.`),
            ),
            `${resource}.${field.apiField}`,
          ).toBe(true)
          expect(field.completeness, `${resource}.${field.apiField}`).toBe('complete')
        }
      }
  })
}
