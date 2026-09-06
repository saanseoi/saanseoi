import { createHash } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { isCancel, note, select, text } from '@clack/prompts'
import type { RoadCentrelineStreet } from '../../../harbour-cli/src/lib/sources/landsd/roadCentreline.ts'
import { groupRoadCentrelineIssues } from '../../../harbour-cli/src/lib/sources/landsd/roadCentrelineReview.ts'
import { terminalSafeText } from './terminal.ts'

type Group = ReturnType<typeof groupRoadCentrelineIssues>[number]
export type ReviewContext = {
  sourceArchiveSha256: string
  sourceVersion: string
  canonicalSnapshotIds: { street: string; divisionArea: string } | null
}
type Decision = { action: 'link'; streetId: string } | { action: 'exclude' }
export type RoadReview = {
  schemaVersion: 1
  context: ReviewContext
  decisions: Record<string, Decision>
}

export function roadReviewKey(group: Group) {
  return createHash('sha256').update(JSON.stringify(group)).digest('hex')
}

export async function loadRoadReview(
  path: string,
  context: ReviewContext,
): Promise<RoadReview> {
  let raw: string
  try {
    raw = await readFile(path, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT')
      return { schemaVersion: 1, context, decisions: {} }
    throw error
  }
  const value = JSON.parse(raw) as RoadReview
  if (
    value.schemaVersion !== 1 ||
    JSON.stringify(value.context) !== JSON.stringify(context) ||
    !value.decisions ||
    typeof value.decisions !== 'object' ||
    Array.isArray(value.decisions)
  ) {
    throw new Error(
      `Road review provenance does not match this archive and canonical snapshots: ${path}`,
    )
  }
  for (const decision of Object.values(value.decisions)) {
    if (
      !decision ||
      (decision.action !== 'exclude' &&
        !(
          decision.action === 'link' &&
          typeof decision.streetId === 'string' &&
          decision.streetId.length > 0
        ))
    ) {
      throw new Error(`Invalid road review decision in ${path}`)
    }
  }
  return value
}

export function applyRoadReview(
  result: {
    records: { objectId: number; streetId: string | null }[]
    issues: Parameters<typeof groupRoadCentrelineIssues>[0]
  },
  streets: RoadCentrelineStreet[],
  review: RoadReview,
) {
  const ids = new Set(streets.map(street => street.id))
  const resolved = new Map<number, string | null>()
  for (const group of groupRoadCentrelineIssues(result.issues, streets)) {
    const decision = review.decisions[roadReviewKey(group)]
    if (!decision) continue
    if (decision.action === 'link' && !ids.has(decision.streetId))
      throw new Error(`Unknown canonical street ${decision.streetId}`)
    for (const id of group.objectIds)
      resolved.set(id, decision.action === 'link' ? decision.streetId : null)
  }
  for (const record of result.records)
    if (resolved.has(record.objectId))
      record.streetId = resolved.get(record.objectId) ?? null
  result.issues = result.issues.filter(issue => !resolved.has(issue.objectId))
}

const colour = (value: string, code: number) =>
  `\u001b[38;5;${code}m${terminalSafeText(value).replace(/[\n\r\t]/g, ' ')}\u001b[39m`
export function formatRoadEvidence(street: RoadCentrelineStreet) {
  return `${colour(street.englishName || '—', 39)} · ${colour(street.traditionalChineseName || '—', 213)} · ${colour(street.districtIds.join(', ') || 'No district evidence', 220)}`
}

export function findRoadCandidates(
  group: Group,
  streets: RoadCentrelineStreet[],
  query?: string,
) {
  return rankRoadCandidates(group, streets, query).map(({ street }) => street)
}

function rankRoadCandidates(
  group: Group,
  streets: RoadCentrelineStreet[],
  query?: string,
) {
  const normalise = (value: string) =>
    value
      .toUpperCase()
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .trim()
  const english = normalise(group.englishName)
  const words = new Set(english.split(' ').filter(word => word.length > 2))
  return streets
    .map(street => {
      const name = normalise(street.englishName)
      const chinese =
        group.traditionalChineseName &&
        street.traditionalChineseName === group.traditionalChineseName
      const sameDistrict = street.districtIds.some(id =>
        group.derivedDistrictIds.includes(id),
      )
      const score =
        (group.candidates.some(candidate => candidate.id === street.id) ? 100 : 0) +
        (chinese ? 60 : 0) +
        (name === english ? 50 : 0) +
        name.split(' ').filter(word => words.has(word)).length * 3 +
        (sameDistrict ? 2 : 0)
      return { street, score }
    })
    .filter(({ street, score }) =>
      query
        ? normalise(
            `${street.englishName} ${street.traditionalChineseName} ${street.id}`,
          ).includes(normalise(query))
        : score > 2,
    )
    .sort(
      (a, b) =>
        b.score - a.score || a.street.englishName.localeCompare(b.street.englishName),
    )
    .slice(0, 20)
}

/** Review strongest evidence first, preferring a clear winner over tied candidates. */
export function sortRoadReviewGroups(groups: Group[], streets: RoadCentrelineStreet[]) {
  return groups
    .map(group => {
      const ranked = rankRoadCandidates(group, streets)
      const score = ranked[0]?.score ?? 0
      return { group, score, margin: score - (ranked[1]?.score ?? 0) }
    })
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.margin - a.margin ||
        a.group.englishName.localeCompare(b.group.englishName) ||
        roadReviewKey(a.group).localeCompare(roadReviewKey(b.group)),
    )
    .map(({ group }) => group)
}

export async function promptRoadReview(
  groups: Group[],
  streets: RoadCentrelineStreet[],
  review: RoadReview,
  path: string,
) {
  if (!process.stdin.isTTY || !process.stdout.isTTY)
    throw new Error('Road review requires an interactive terminal.')
  note(
    'Blue: English · pink: Chinese · yellow: district IDs. Suggestions are name evidence, not confirmed identities. Each choice applies to every segment in the group. Choices save immediately; skipping leaves publication blocked.',
    'ROAD SEGMENT REVIEW',
  )
  for (const [index, group] of sortRoadReviewGroups(groups, streets).entries()) {
    if (review.decisions[roadReviewKey(group)]) continue
    let candidates = findRoadCandidates(group, streets)
    while (true) {
      note(
        [
          formatRoadEvidence({
            id: '',
            englishName: group.englishName,
            traditionalChineseName: group.traditionalChineseName,
            districtIds: group.derivedDistrictIds,
          }),
          `${group.kind} · ${group.segmentCount} segments · group ${index + 1}/${groups.length}`,
          `Object IDs: ${group.objectIds.slice(0, 12).join(', ')}${group.objectIds.length > 12 ? ' … (all IDs in report)' : ''}`,
        ].join('\n'),
        'SOURCE EVIDENCE',
      )
      const answer = await select({
        message: 'Match or process this group',
        options: [
          ...candidates.map(street => ({
            value: `link:${street.id}`,
            label: formatRoadEvidence(street),
            hint: street.id,
          })),
          {
            value: 'search',
            label: 'Search canonical streets by English, Chinese or ID',
          },
          {
            value: 'exclude',
            label: 'Retain as source evidence only',
            hint: 'Exclude these segments from canonical Streets composition.',
          },
          { value: 'skip', label: 'Leave unresolved for later investigation' },
          { value: 'stop', label: 'Save and exit review' },
        ],
      })
      if (isCancel(answer) || answer === 'stop') return
      if (answer === 'search') {
        const query = await text({
          message: 'Street name or canonical ID',
          validate: value => (!value?.trim() ? 'Enter a name or ID.' : undefined),
        })
        if (isCancel(query)) return
        candidates = findRoadCandidates(group, streets, query.trim())
        if (!candidates.length)
          note(
            'No canonical streets match. Try another spelling or leave unresolved.',
            'SEARCH',
          )
        continue
      }
      if (answer === 'skip') break
      review.decisions[roadReviewKey(group)] =
        answer === 'exclude'
          ? { action: 'exclude' }
          : { action: 'link', streetId: answer.slice(5) }
      await mkdir(dirname(path), { recursive: true })
      const temporary = `${path}.${process.pid}.tmp`
      await writeFile(temporary, `${JSON.stringify(review, null, 2)}\n`)
      await rename(temporary, path)
      break
    }
  }
}
