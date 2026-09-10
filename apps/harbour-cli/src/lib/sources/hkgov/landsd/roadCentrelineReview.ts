import type {
  RoadCentrelineMatchIssue,
  RoadCentrelineStreet,
} from './roadCentreline.ts'

/** Groups review work without making street identity decisions. */
export function groupRoadCentrelineIssues(
  issues: RoadCentrelineMatchIssue[],
  streets: RoadCentrelineStreet[],
) {
  const byId = new Map(streets.map(street => [street.id, street]))
  const groups = new Map<
    string,
    {
      kind: RoadCentrelineMatchIssue['kind']
      englishName: string
      traditionalChineseName: string
      derivedDistrictIds: string[]
      candidates: RoadCentrelineStreet[]
      objectIds: number[]
      segmentCount: number
    }
  >()
  for (const issue of issues) {
    const districts = [...issue.derivedDistrictIds].sort()
    const candidates = [...issue.candidates].sort()
    const key = JSON.stringify([
      issue.kind,
      issue.englishName,
      issue.traditionalChineseName,
      districts,
      candidates,
    ])
    const group = groups.get(key) ?? {
      kind: issue.kind,
      englishName: issue.englishName,
      traditionalChineseName: issue.traditionalChineseName,
      derivedDistrictIds: districts,
      candidates: candidates.map(id => {
        const street = byId.get(id)
        if (!street) throw new Error(`Unknown Road Centreline candidate ${id}.`)
        return street
      }),
      objectIds: [],
      segmentCount: 0,
    }
    group.objectIds.push(issue.objectId)
    group.segmentCount++
    groups.set(key, group)
  }
  return [...groups.values()]
    .sort(
      (a, b) =>
        a.kind.localeCompare(b.kind) ||
        a.englishName.localeCompare(b.englishName) ||
        a.traditionalChineseName.localeCompare(b.traditionalChineseName),
    )
    .map(group => ({ ...group, objectIds: group.objectIds.sort((a, b) => a - b) }))
}
