import { expect, test } from 'bun:test'
import { groupRoadCentrelineIssues } from './roadCentrelineReview.ts'

test('groups repeated segments but keeps different names and district evidence separate', () => {
  const issue = {
    objectId: 2,
    kind: 'ambiguous' as const,
    englishName: 'CHEUNG SHING STREET',
    traditionalChineseName: '長城街',
    candidates: ['candidate'],
    derivedDistrictIds: ['district'],
  }
  const candidate = {
    id: 'candidate',
    englishName: 'CHEUNG SHING STREET',
    traditionalChineseName: '長城街',
    districtIds: ['district'],
  }
  const groups = groupRoadCentrelineIssues(
    [
      issue,
      { ...issue, objectId: 1 },
      { ...issue, objectId: 3, traditionalChineseName: '長盛街' },
      { ...issue, objectId: 4, derivedDistrictIds: ['another-district'] },
    ],
    [candidate],
  )
  expect(groups).toHaveLength(3)
  expect(groups.find(group => group.segmentCount === 2)).toMatchObject({
    objectIds: [1, 2],
    candidates: [candidate],
    traditionalChineseName: '長城街',
  })
  expect(groups.reduce((count, group) => count + group.segmentCount, 0)).toBe(4)
})
