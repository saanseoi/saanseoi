import { loadDivisionReviewInputs } from '../src/lib/pipeline/curatedDivisions/reviewInputs'
/** Generate review artefacts only; never updates the assignment registry. */
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import {
  curateIslands,
  assertIslandCurationReady,
  curatedIslandToSaanSeoiDivisionRow,
} from '../src/lib/pipeline/islands/islandCuration'

const root = resolve(import.meta.dir, '../../..')
const read = (path: string) => Bun.file(resolve(root, path)).json()
const base = 'fixtures/meta/curations/saanseoi-division'
const inputs = await loadDivisionReviewInputs({ root })
const result = curateIslands(inputs.islands, inputs.islandReview)
assertIslandCurationReady(result)
const review = inputs.inventory
const registry = await read('fixtures/meta/divisionCodes/geographic.json')
type Proposal = {
  id: string
  sourceId?: string
  name: string
  zh: string
  divisionClass: string
  areaKm2: number | null
  code?: string
  initialCode?: string
  reason?: string
  status?: string
}
const rows: Proposal[] = result.islands.map(island => {
  const division = curatedIslandToSaanSeoiDivisionRow(island)
  return {
    id: String(division.id),
    sourceId: island.id,
    name: island.names.en,
    zh: island.names.zh ?? '',
    divisionClass: String(division.class),
    areaKm2: island.areaKm2 > 0 ? island.areaKm2 : null,
  }
})
for (const r of review.divisions.filter((r: any) => r.class === 'island_group')) {
  rows.push({
    id: r.id,
    name: r.names.en,
    zh: r.names['zh-hant'] ?? '',
    divisionClass: r.class,
    areaKm2: null,
  })
}
if (new Set(rows.map(r => r.id)).size !== rows.length)
  throw Error('Duplicate canonical island identity')
const assignments = new Map<string, string>(
  registry.assignments.map((a: any) => [a.canonicalId, a.divisionCode]),
)
const used = new Map<string, string>()
for (const a of registry.assignments.filter((a: any) =>
  ['major_island', 'minor_island', 'islet', 'island_group'].includes(a.divisionClass),
)) {
  if (used.has(a.divisionCode))
    throw Error(`Existing landform collision: ${a.divisionCode}`)
  used.set(a.divisionCode, a.canonicalId)
}
// Reserve explicit review choices before generating any automatic proposals.
const choices: Array<{ id: string; name: string; code: string }> = await read(
  'scripts/divisions/island-code-choices.json',
)
const reviewedCodes = new Map<string, string>()
for (const choice of choices) {
  const row = rows.find(r => r.id === choice.id)
  if (!row || row.name !== choice.name)
    throw Error(`Stale island choice: ${choice.name}`)
  if (reviewedCodes.has(choice.id)) throw Error(`Duplicate island choice: ${choice.id}`)
  const owner = used.get(choice.code)
  if (owner && owner !== choice.id)
    throw Error(`Reviewed code collision: ${choice.code}`)
  const existing = assignments.get(choice.id)
  if (existing && existing !== choice.code)
    throw Error(`Existing assignment differs: ${choice.name}`)
  reviewedCodes.set(choice.id, choice.code)
  used.set(choice.code, choice.id)
}
const words = (r: Proposal) =>
  (r.name.replaceAll("'", '').match(/[A-Za-z0-9]+/g) ?? [])
    .map(w => w.toUpperCase())
    .filter(w => !['THE', 'AND', 'OF', 'GROUP', 'ISLANDS'].includes(w))
const initials = (r: Proposal) =>
  words(r)
    .map(w => w[0])
    .join('')
// Islands receive their preferred initials before groups. Within islands, measured
// area descending decides priority; unknown areas sort last. IDs break exact ties.
rows.sort(
  (a, b) =>
    Number(a.divisionClass === 'island_group') -
      Number(b.divisionClass === 'island_group') ||
    (b.areaKm2 ?? -1) - (a.areaKm2 ?? -1) ||
    a.id.localeCompare(b.id),
)
const reservedInitials = new Set(rows.map(initials))
const normalName = (r: Proposal) => r.name.toUpperCase().replace(/[^A-Z0-9]/g, '')
for (const r of rows) {
  const initial = initials(r)
  if (!initial) throw Error(`Missing English name: ${r.id}`)
  r.initialCode = initial
  const existing = assignments.get(r.id)
  if (existing) {
    r.code = existing
    r.status = 'assigned'
    r.reason = 'Existing reviewed assignment'
    continue
  }
  const reviewed = reviewedCodes.get(r.id)
  if (reviewed) {
    r.code = reviewed
    r.status = 'proposal'
    r.reason = 'Explicit user code choice'
    continue
  }
  let code = initial
  let reason = 'Available initials; larger measured islands have priority'
  if (used.has(code) && r.divisionClass === 'island_group') {
    code += 'G'
    reason = 'Group suffix resolves collision'
  }
  if (used.has(code)) {
    const parts = words(r)
    const homonym = rows.some(
      other => other.id !== r.id && other.code && normalName(other) === normalName(r),
    )
    const candidates: string[] = homonym ? [`${initial}X`] : []
    for (let length = 2; length <= Math.max(...parts.map(w => w.length)); length++) {
      for (let i = 0; i < parts.length; i++) {
        if (['ISLAND', 'ISLET', 'CHAU', 'PAI', 'ROCK'].includes(parts[i]!)) continue
        candidates.push(
          parts.map((w, j) => (j === i ? w.slice(0, length) : w[0])).join('') +
            (r.divisionClass === 'island_group' ? 'G' : ''),
        )
      }
    }
    code =
      candidates.find(c => !used.has(c) && !reservedInitials.has(c)) ?? `${initial}X`
    while (used.has(code) || reservedInitials.has(code)) code += 'X'
    reason = 'Expanded word or homonym suffix; review required'
  }
  r.code = code
  r.status = 'proposal'
  r.reason = reason
  used.set(code, r.id)
}
if (new Set(rows.map(r => r.code)).size !== rows.length)
  throw Error('Proposed code collision')
const output = resolve(root, process.argv[2] ?? 'docs/datasets/internal/reviews')
await mkdir(output, { recursive: true })
await Bun.write(
  resolve(output, 'island-code-proposals.json'),
  `${JSON.stringify(
    {
      status: rows.every(r => r.status === 'assigned')
        ? 'assigned-in-fixture'
        : 'proposal-only',
      inputs: {
        inventory: 'fixtures/meta/datasetInputs/saanseoi-division-review.json',
        review: `${base}/division-exclusions.json`,
        identities: `${base}/division-additions.json`,
      },
      proposals: rows,
    },
    null,
    2,
  )}\n`,
)
const clean = (v: unknown) => String(v ?? '').replaceAll('|', '\\|')
await Bun.write(
  resolve(output, 'island-code-proposals.md'),
  [
    '# Island code review',
    '',
    'Assignment status is read from the fixture; this report does not establish publication. Codes are unique across all island classes and island groups. Existing assignments and explicit user code choices are reserved; larger measured islands receive conflicting initials first. Groups use a G suffix when needed. Corrected reviewed polygon areas determine priority; unknown areas are not treated as measured zero. Group area is not measured here, and groups receive codes after individual islands.',
    '',
    'Regenerate with `bun apps/harbour-cli/scripts/proposeIslandCodes.ts`.',
    '',
    '| Code | Name | 中文 | Class | Area km² | Status | Reason |',
    '| --- | --- | --- | --- | ---: | --- | --- |',
    ...rows.map(
      r =>
        `| ${[r.code, r.name, r.zh, r.divisionClass, r.areaKm2?.toFixed(6) ?? 'Unknown', r.status, r.reason].map(clean).join(' | ')} |`,
    ),
    '',
  ].join('\n'),
)
console.log(
  JSON.stringify(
    {
      rows: rows.length,
      assigned: rows.filter(r => r.status === 'assigned').length,
      proposals: rows.filter(r => r.status === 'proposal').length,
      unknownArea: rows.filter(r => r.areaKm2 === null).length,
      groups: rows
        .filter(r => r.divisionClass === 'island_group')
        .map(r => ({ name: r.name, code: r.code })),
    },
    null,
    2,
  ),
)
