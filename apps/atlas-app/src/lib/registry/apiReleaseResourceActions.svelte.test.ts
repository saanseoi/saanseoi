import { expect, test } from 'vitest'
import {
  buildApiReleaseResourceActions,
  selectApiReleaseResources,
} from './apiReleaseResourceActions'
import type { ApiReleaseSnapshot } from './types'

const resources: ApiReleaseSnapshot[] = [
  {
    snapshotId: 'overture',
    variant: 'overture-places',
    role: 'supplementary',
    snapshot: { id: 'overture', resourceType: 'address', code: 'overture' },
  },
  {
    snapshotId: 'government',
    variant: 'hkgov-dpo',
    role: 'primary',
    snapshot: { id: 'government', resourceType: 'address', code: 'government' },
  },
  {
    snapshotId: 'division',
    variant: 'overture',
    role: 'lookup',
    snapshot: { id: 'division', resourceType: 'division', code: 'division' },
  },
]

test('default selection includes all variants of the primary resource type, primary first', () => {
  const selection = selectApiReleaseResources(resources, null)
  expect(selection.key).toBe('address:all')
  expect(selection.resources.map(resource => resource.snapshotId)).toEqual([
    'government',
    'overture',
  ])
})

test('explicit variant selection and All links retain their scope', () => {
  expect(
    selectApiReleaseResources(resources, 'address:overture-places').resources.map(
      resource => resource.snapshotId,
    ),
  ).toEqual(['overture'])
  expect(selectApiReleaseResources(resources, 'address:all').resources).toHaveLength(2)
  expect(
    selectApiReleaseResources(resources, 'division:all').resources.map(
      resource => resource.snapshotId,
    ),
  ).toEqual(['division'])
})

test('All is a selectable option and survives resource type changes', () => {
  const selection = selectApiReleaseResources(resources, null)
  let selected = ''
  const actions = buildApiReleaseResourceActions(
    resources,
    selection.resource,
    value => {
      selected = value
    },
    selection.allVariants,
  )
  expect(actions[1]?.value).toBe('address:all')
  expect(actions[1]?.options?.[0]).toEqual({ value: 'address:all', label: 'All' })
  actions[0]?.onValueChange?.('division')
  expect(selected).toBe('division:all')
  actions[1]?.onValueChange?.('address:overture-places')
  expect(selected).toBe('address:overture-places')
})
