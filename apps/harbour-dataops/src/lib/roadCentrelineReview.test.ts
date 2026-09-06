import { describe, expect, test } from 'bun:test'
import {
  applyRoadReview,
  findRoadCandidates,
  formatRoadEvidence,
  loadRoadReview,
  roadReviewKey,
  sortRoadReviewGroups,
  type RoadReview,
} from './roadCentrelineReview.ts'
import { groupRoadCentrelineIssues } from '../../../harbour-cli/src/lib/sources/landsd/roadCentrelineReview.ts'

const streets = [
  {
    id: 'street-a',
    englishName: 'FIRST STREET',
    traditionalChineseName: '第一街',
    districtIds: ['district-a'],
  },
]
const issue = {
  objectId: 1,
  englishName: '1ST STREET',
  traditionalChineseName: '第一街',
  derivedDistrictIds: ['district-a'],
  candidates: [],
  kind: 'unmatched' as const,
}
const group = groupRoadCentrelineIssues([issue], streets)[0]!
const review = (decision: RoadReview['decisions'][string]): RoadReview => ({
  schemaVersion: 1,
  context: {
    sourceArchiveSha256: 'hash',
    sourceVersion: '2026-Q2',
    canonicalSnapshotIds: null,
  },
  decisions: { [roadReviewKey(group)]: decision },
})
const result = () => ({
  records: [{ objectId: 1, streetId: null as string | null }],
  issues: [issue],
})

describe('Road segment review', () => {
  test('reviews strong matches before weak and absent matches', () => {
    const weak = { ...group, englishName: 'FIRST ROAD', traditionalChineseName: '' }
    const absent = { ...group, englishName: 'UNKNOWN', traditionalChineseName: '' }
    expect(sortRoadReviewGroups([absent, weak, group], streets)).toEqual([
      group,
      weak,
      absent,
    ])
  })
  test('suggests Chinese-name matches and supports canonical ID search', () => {
    expect(findRoadCandidates(group, streets)).toEqual(streets)
    expect(findRoadCandidates(group, streets, 'street-a')).toEqual(streets)
    expect(findRoadCandidates(group, streets, '不存在')).toEqual([])
  })
  test('applies explicit links and source-only exclusions', () => {
    const linked = result()
    applyRoadReview(linked, streets, review({ action: 'link', streetId: 'street-a' }))
    expect(linked.records[0]?.streetId).toBe('street-a')
    expect(linked.issues).toHaveLength(0)
    const excluded = result()
    applyRoadReview(excluded, streets, review({ action: 'exclude' }))
    expect(excluded.records).toHaveLength(1)
    expect(excluded.records[0]?.streetId).toBeNull()
    expect(excluded.issues).toHaveLength(0)
  })
  test('changed group evidence remains unresolved and invalid street IDs fail', () => {
    const changed = result()
    changed.issues = [{ ...issue, traditionalChineseName: '另一街' }]
    applyRoadReview(changed, streets, review({ action: 'exclude' }))
    expect(changed.issues).toHaveLength(1)
    expect(() =>
      applyRoadReview(
        result(),
        streets,
        review({ action: 'link', streetId: 'missing' }),
      ),
    ).toThrow('Unknown canonical street')
  })
  test('missing decision files start unresolved', async () => {
    const context = review({ action: 'exclude' }).context
    expect(
      (await loadRoadReview('/tmp/nonexistent-road-review-test/file.json', context))
        .decisions,
    ).toEqual({})
  })
  test('publisher text cannot insert terminal control sequences', () => {
    expect(
      formatRoadEvidence({ ...streets[0]!, englishName: '\u001b[2Jbad\nname' }),
    ).not.toContain('\u001b[2J')
    expect(formatRoadEvidence(streets[0]!)).toContain('第一街')
  })
})
