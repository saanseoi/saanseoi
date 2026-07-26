import { expect, test } from 'bun:test'

import { emptyLandsdStreetCuration } from './landsdStreetCuration.ts'

test('starts with a versioned application-fixture manifest', () => {
  expect(emptyLandsdStreetCuration()).toEqual({ schemaVersion: 2, decisions: [] })
})
