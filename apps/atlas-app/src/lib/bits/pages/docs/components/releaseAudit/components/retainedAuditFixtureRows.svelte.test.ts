import { expect, test } from 'vitest'
import { render } from 'vitest-browser-svelte'
import IdentityMappings from './retainedAuditIdentityMappings.svelte'
import FieldMappings from './retainedAuditFieldMappings.svelte'
import {
  auditFixtureRows,
  filterAuditFixture,
  mergeAuditFixtures,
} from './retainedAuditFixtureRows'
import geographic from '../../../../../../../../../../fixtures/meta/divisionCodes/geographic.json'

test('a registry-code search renders the older identity row with its lookup label', async () => {
  const entry = geographic.assignments[0]
  if (!entry) throw new Error('Expected a geographic assignment')
  const fixture = mergeAuditFixtures([
    { mappings: [{ canonicalId: entry.canonicalId, externalId: 'older-fixture' }] },
  ])
  const mappings = auditFixtureRows(filterAuditFixture(fixture, entry.divisionCode))
  const screen = await render(IdentityMappings, { mappings })
  await expect.element(screen.getByText('older-fixture')).toBeVisible()
  await expect
    .element(screen.getByText(entry.divisionCode, { exact: true }))
    .toHaveAttribute('title', 'Current registered division code')
})

test('reviewed localisation finds exactly one selected field row', async () => {
  const fixture = mergeAuditFixtures([
    { fields: [{ sourceField: 'POP', metadata: { fieldName: 'population' } }] },
    {
      fields: [
        {
          sourceField: 'POP',
          fieldName: 'population',
          localisations: [{ name: '人口' }],
        },
      ],
    },
  ])
  const fields = auditFixtureRows(filterAuditFixture(fixture, '人口'))
  const screen = await render(FieldMappings, { fields })
  await expect.element(screen.getByText('POP', { exact: true })).toBeVisible()
  expect(screen.getByRole('row').elements()).toHaveLength(2)
})
