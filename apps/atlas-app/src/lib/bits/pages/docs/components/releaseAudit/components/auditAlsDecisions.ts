import type { Json } from '@repo/core/provenance'

type RecordValue = Record<string, Json>
const object = (v: Json | undefined): RecordValue =>
  v && typeof v === 'object' && !Array.isArray(v) ? v : {}
const array = (v: Json | undefined): Json[] => (Array.isArray(v) ? v : [])
const text = (v: Json | undefined) => (typeof v === 'string' ? v : '')
const date = (v: Json | undefined) => {
  const s = text(v)
  return (
    s.match(/\d{4}-\d{2}-\d{2}\.\d+/)?.[0] ??
    (s.match(/^\d{8}-/) ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}.0` : '')
  )
}
const versions = (d: RecordValue) =>
  array(d.sourceVersions ?? d.versions)
    .map(date)
    .filter(Boolean)

/** A release schedule is evidence of scope, not proof that a source guard matched. */
export function alsDecisionInRelease(d: RecordValue, release: string): boolean {
  const v = date(release)
  if (!v) return false
  const scheduled = versions(d)
  if (scheduled.includes(v)) return true
  const application = object(d.application)
  if (
    application.state === 'active' &&
    application.mode === 'until-revoked' &&
    v > text(application.sourceVersionFrom)
  )
    return true
  if (scheduled.length) return false
  const releases = array(d.releases)
  if (releases.length) {
    const entry = releases.map(object).find(r => date(r.version) === v)
    return !!entry && entry.count !== 0
  }
  if (
    d.sourceVersionFrom ||
    d.sourceVersionTo ||
    ('sourceVersionFrom' in d && 'sourceVersionTo' in d)
  )
    return (
      (!d.sourceVersionFrom || v >= text(d.sourceVersionFrom)) &&
      (!d.sourceVersionTo || v <= text(d.sourceVersionTo))
    )
  const assertions = [
    ...array(d.assertions),
    ...array(d.assertions2d),
    ...array(d.signatures),
  ]
  return assertions.some(a => {
    const row = object(a)
    return date(row.version) === v || versions(row).includes(v)
  })
}

const kinds = {
  gap: [
    'Fill a temporary coverage gap',
    'Restore missing components only where the same address is supported by the surrounding releases.',
  ],
  backfill: [
    'Backfill earlier coverage',
    'Use reviewed evidence from a later release to restore an earlier address or unit inventory.',
  ],
  forward: [
    'Carry coverage forward',
    'Retain a previously verified address or inventory when it is absent from a later delivery.',
  ],
  coordinate: [
    'Replace a coordinate',
    'Replace the guarded source point with the reviewed point while retaining the original location as evidence.',
  ],
  merge: [
    'Consolidate duplicate addresses',
    'Keep one address for source records confirmed to describe the same location; retain the separate source assertions.',
  ],
  suppress: [
    'Exclude a conflicting assertion',
    'Keep the reviewed owner and exclude a duplicate or incorrectly assigned assertion from the published result.',
  ],
  identity: [
    'Correct an identifier',
    'Use the reviewed identifier only when the source identity and address components match.',
  ],
  component: [
    'Restore or correct address components',
    'Set the reviewed address fields after checking the expected source values.',
  ],
  hierarchy: [
    'Resolve address containment',
    'Link the reviewed parent and child addresses without inventing unit coverage.',
  ],
  inventory: [
    'Correct a unit inventory',
    'Apply only the reviewed unit additions and removals after checking the original inventory.',
  ],
  dated: [
    'Preserve a dated inventory change',
    'Keep the change at its recorded date; do not extend new unit coverage into earlier releases.',
  ],
  separate: [
    'Retain distinct addresses',
    'Keep separately valid addresses even when they share an identifier or unit inventory.',
  ],
} as const
export type AlsDecisionKind = keyof typeof kinds
export type AlsDecision = {
  id: string
  kind: AlsDecisionKind
  title: string
  description: string
  context: string[]
  input: RecordValue
  output: RecordValue
  mode: string
  since: string
  lastVerified: string
  raw: Json
}
const collections = [
  'overrides',
  'backfills',
  'corrections',
  'suppressions',
  'coalescences',
  'duplicates',
  'decisions',
  'retentions',
  'promotions',
  'rules',
  'restorations',
  'streetRestorations',
  'relationships',
  'reconstructions',
  'reconciliations',
]

function kindFor(
  type: string,
  key: string,
  d: RecordValue,
  release: string,
): AlsDecisionKind {
  if (type.includes('coordinate') || type.endsWith('oi-hei-backfill'))
    return 'coordinate'
  if (type.includes('3d-corrections')) return 'inventory'
  if (type.includes('dated-event')) return 'dated'
  if (type.includes('component-gap')) return 'gap'
  if (/2d-backfills|3d-backfills/.test(type))
    return date(d.evidenceSourceVersion) < date(release) ? 'forward' : 'backfill'
  if (key === 'duplicates' || key === 'suppressions' || d.action === 'suppress')
    return 'suppress'
  if (/coalescence|consolidation|reconciliation/.test(type)) return 'merge'
  if (
    /csu-corrections|lin-tsui/.test(type) ||
    (type.includes('approved-estate') && key === 'corrections')
  )
    return 'identity'
  if (/shared-building|retentions/.test(type)) return 'separate'
  if (/hierarch|nested|complex|ownership/.test(type) && d.action !== 'phase')
    return 'hierarchy'
  if (/reconstruction/.test(type)) return 'backfill'
  return 'component'
}

function handling(d: RecordValue, kind: AlsDecisionKind, release: string) {
  const input: RecordValue = {}
  const output: RecordValue = {}
  const copy = (target: RecordValue, keys: string[]) => {
    for (const key of keys) if (d[key] !== undefined) target[key] = d[key]!
  }
  copy(input, [
    'expected',
    'expectedEn',
    'expectedZh',
    'previousCoordinates',
    'from',
    'csus',
    'expectedUnitCount',
    'removals',
    'duplicate',
    'owner',
    'aliasCsu',
    'sourceEnName',
    'sourceZhName',
    'child',
    'buildings',
    'namedRepresentations',
  ])
  copy(output, [
    'overrides',
    'currentCoordinates',
    'to',
    'additions',
    'preferredEnName',
    'preferredZhName',
    'parent',
    'complex',
    'canonical',
    'childCoordinates',
    'streetOverride',
    'enLocality',
    'zhLocality',
    'number',
    'enName',
    'zhName',
  ])
  if (d.overrides && d.expected) {
    input.expected = Object.fromEntries(
      Object.keys(object(d.overrides)).map(key => [
        key,
        object(d.expected)[key] ?? null,
      ]),
    )
  }
  if (!Object.keys(input).length) {
    const assertion = array(d.assertions)
      .map(object)
      .find(
        a => date(a.version) === date(release) || versions(a).includes(date(release)),
      )
    if (assertion?.premises) input.address = assertion.premises
    if (assertion?.geometry) input.geometry = assertion.geometry
    if (assertion?.count !== undefined) input.sourceAssertions = assertion.count
    if (assertion?.hashes) input.sourceAssertions = array(assertion.hashes).length
    if (assertion?.en) input.units = assertion.en
  }
  if (kind === 'gap' || d.versions)
    copy(output, ['enEstate', 'zhEstate', 'enStreet', 'zhStreet'])
  const fixed = object(d.fixedCoordinates)
  if (
    Object.keys(fixed).length &&
    (!fixed.sourceVersions || alsDecisionInRelease(fixed, release))
  )
    output.coordinates = fixed.coordinates ?? null
  const selection = object(d.coordinateSelection)
  if (Object.keys(selection).length && alsDecisionInRelease(selection, release)) {
    input.ownerCoordinates = selection.ownerCoordinates ?? null
    input.aliasCoordinates = selection.aliasCoordinates ?? null
    output.coordinates =
      selection.selected === 'alias'
        ? (selection.aliasCoordinates ?? null)
        : (selection.ownerCoordinates ?? null)
  }
  if (
    d.coordinates &&
    !output.coordinates &&
    ['coordinate', 'hierarchy', 'backfill'].includes(kind)
  )
    output.coordinates = d.coordinates
  else if (d.coordinates) input.coordinates = d.coordinates
  const feature = object(d.feature ?? object(d.evidence).feature)
  if (Object.keys(feature).length) {
    output.address = object(object(feature.properties).Address).PremisesAddress ?? null
    output.geometry = feature.geometry ?? null
  }
  const epoch = array(d.releases)
    .map(object)
    .find(r => date(r.version) === date(release))
  if (epoch) {
    if (epoch.expected !== undefined) input.sourceAddresses = epoch.expected
    if (epoch.count !== undefined) input.sourceAssertions = epoch.count
  }
  if (kind === 'suppress') output.publishedAssertions = 0
  if (kind === 'inventory' && typeof d.expectedUnitCount === 'number')
    output.units =
      d.expectedUnitCount - array(d.removals).length + array(d.additions).length
  if (kind === 'merge')
    output.retainedAddress = d.owner ?? d.ownerCsu ?? d.csu ?? 'One reviewed address'
  if (kind === 'forward' || kind === 'backfill') {
    input.evidenceRelease =
      d.evidenceSourceVersion ?? object(d.evidence).sourceVersion ?? null
    if (d.expectedUnitCount) output.units = d.expectedUnitCount
  }
  if (kind === 'separate') {
    output.handling = 'Retain distinct valid addresses and their source evidence'
    copy(output, ['csu', 'namedCsu', 'retainOriginalCoordinates'])
  }
  if (kind === 'dated') {
    input.eventDate = d.eventSourceVersion ?? null
    output.handling =
      date(release) < date(d.eventSourceVersion)
        ? 'Retain the earlier inventory'
        : 'Retain the inventory from the event date'
  }
  return { input, output }
}

export function alsAuditDecisions(
  groups: Record<string, Json>,
  release: string,
): AlsDecision[] {
  const result: AlsDecision[] = []
  for (const [type, value] of Object.entries(groups)) {
    const document = object(value)
    const candidates = collections.flatMap(key =>
      array(document[key]).map(row => ({ key, row: object(row) })),
    )
    if (!candidates.length && (document.id || document.csu))
      candidates.push({ key: 'decision', row: document })
    for (const key of ['hungHom', 'koYee', 'suppression'])
      if (document[key]) candidates.push({ key, row: object(document[key]) })
    for (const { key, row } of candidates) {
      const d = {
        ...Object.fromEntries(
          ['application', 'sourceVersionFrom', 'sourceVersionTo']
            .filter(k => k in document)
            .map(k => [k, document[k]!]),
        ),
        ...row,
      }
      if (!alsDecisionInRelease(d, release)) continue
      const kind = kindFor(type, key, d, release)
      const application = object(d.application)
      const scope = [
        ...versions(d),
        ...array(d.releases).map(r => date(object(r).version)),
        ...array(d.assertions).map(r => date(object(r).version)),
      ]
        .filter(Boolean)
        .sort()
      const common = object(d.complex)
      const en = object(d.expectedEn)
      const context = [
        d.enBuildingName ??
          d.expectedEnBuildingName ??
          d.enBuilding ??
          d.name ??
          en.BuildingName,
        d.blockRef ? `Block ${d.blockRef}` : null,
        d.estate ?? d.enEstateName ?? d.enEstate ?? common.enName,
        d.district ?? en.EngDistrict,
      ].flatMap(v =>
        typeof v === 'string'
          ? [v]
          : typeof object(v).EstateName === 'string'
            ? [text(object(v).EstateName)]
            : [],
      )
      result.push({
        id: `${type}:${text(d.id) || key}:${result.length}`,
        kind,
        title: kinds[kind][0],
        description: kinds[kind][1],
        context: [...new Set(context)],
        ...handling(d, kind, release),
        mode:
          text(application.mode) ||
          (d.sourceVersionTo === null ? 'Open-ended' : 'Bounded releases'),
        since:
          text(application.sourceVersionFrom) ||
          text(d.sourceVersionFrom) ||
          scope[0] ||
          'Not recorded',
        lastVerified: text(application.lastVerifiedSourceVersion) || 'Not recorded',
        raw: { fixture: type, decision: d },
      })
    }
  }
  return result
}

/** Readable fields, not serialised JSON. Large inventories remain available through copy. */
const fieldLabel = (key: string) =>
  (
    ({
      previousCoordinates: 'Source coordinate',
      currentCoordinates: 'Reviewed coordinate',
      evidenceRelease: 'Evidence release',
      expectedUnitCount: 'Source units',
    }) as Record<string, string>
  )[key] ??
  key
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .replace(/^./, c => c.toUpperCase())

export function alsHandlingFields(
  value: Json,
  prefix = '',
): Array<{ label: string; value: string }> {
  if (Array.isArray(value)) {
    if (value.every(v => typeof v === 'number'))
      return [{ label: prefix, value: value.join(', ') }]
    if (value.every(v => typeof v === 'string'))
      return [{ label: prefix, value: value.join(' · ') }]
    if (value.length > 12)
      return [
        {
          label: prefix,
          value: `${value.length.toLocaleString()} entries (copy for full details)`,
        },
      ]
    return value.flatMap((v, i) => alsHandlingFields(v, `${prefix} ${i + 1}`))
  }
  if (value && typeof value === 'object')
    return Object.entries(value)
      .filter(
        ([key]) => !/hash|^(authority|reason|evidence|sourceVersions|id)$/i.test(key),
      )
      .flatMap(([key, v]) =>
        alsHandlingFields(v, [prefix, fieldLabel(key)].filter(Boolean).join(' › ')),
      )
  return [{ label: prefix, value: value === null ? 'Absent' : String(value) }]
}
