import { equalJson, type JsonFieldChange } from '@repo/core/jsonFieldDiff'
import type { ReleaseSampleField } from '#lib/bits/pages/docs/components/releaseSamples/releaseSamplesPresentation.js'

function entries(value: unknown): [string, unknown][] {
  return value !== null && typeof value === 'object' ? Object.entries(value) : []
}
// Pair translations by identity, then cancel exact matches within repeated identities.
// Multiple remaining candidates are shown as additions/removals rather than guessed pairs.
function languageEntries(left: unknown, right: unknown) {
  if (!Array.isArray(left) || !Array.isArray(right)) return null
  const items = [...left, ...right]
  if (
    !items.some(
      item => item && typeof item === 'object' && Object.hasOwn(item, 'language'),
    ) ||
    !items.every(
      item =>
        item &&
        typeof item === 'object' &&
        !Array.isArray(item) &&
        (!Object.hasOwn(item, 'language') ||
          typeof item.language === 'string' ||
          item.language === null),
    )
  )
    return null
  const identity = (item: Record<string, unknown>, keys: string[]) =>
    keys
      .map(
        key =>
          `${key}=${Object.hasOwn(item, key) ? JSON.stringify(item[key]) : 'missing'}`,
      )
      .join(', ')
  const uniqueLanguages = (values: Record<string, unknown>[]) =>
    new Set(values.map(item => identity(item, ['language']))).size === values.length
  const keys =
    uniqueLanguages(left) && uniqueLanguages(right)
      ? ['language']
      : ['language', 'variant', 'side']
  const group = (values: Record<string, unknown>[]) => {
    const groups = new Map<string, Record<string, unknown>[]>()
    for (const item of values) {
      const key = identity(item, keys)
      const bucket = groups.get(key) ?? []
      bucket.push(item)
      groups.set(key, bucket)
    }
    return groups
  }
  const before = group(left)
  const after = group(right)
  const previous: [string, unknown][] = []
  const current: [string, unknown][] = []
  for (const key of new Set([...before.keys(), ...after.keys()])) {
    const oldItems = before.get(key) ?? []
    const remaining = [...(after.get(key) ?? [])]
    const unmatched: Record<string, unknown>[] = []
    const repeated = Math.max(oldItems.length, remaining.length) > 1
    let occurrence = 0
    const pair = (
      oldItem?: Record<string, unknown>,
      newItem?: Record<string, unknown>,
    ) => {
      const label = repeated ? `${key}, occurrence=${occurrence++}` : key
      if (oldItem) previous.push([label, oldItem])
      if (newItem) current.push([label, newItem])
    }
    for (const oldItem of oldItems) {
      const index = remaining.findIndex(item => equalJson(oldItem, item))
      if (index === -1) unmatched.push(oldItem)
      else pair(oldItem, remaining.splice(index, 1)[0])
    }
    if (unmatched.length === 1 && remaining.length === 1) {
      pair(unmatched[0], remaining[0])
    } else {
      for (const item of unmatched) pair(item, undefined)
      for (const item of remaining) pair(undefined, item)
    }
  }
  return { previous, current, identityKeys: keys }
}

function display(value: unknown, exists: boolean, absent: string) {
  if (!exists) return absent
  if (value === null) return 'null'
  if (typeof value === 'object') return Array.isArray(value) ? '[]' : '{}'
  return String(value)
}

export function changeFields(
  before: unknown,
  after: unknown,
  changes: JsonFieldChange[],
  changesOnly: boolean,
  comparison: boolean,
  absent: string,
): ReleaseSampleField[] {
  type ChangedPath = { terminal: boolean; children: Map<string, ChangedPath> }
  const changedPaths: ChangedPath = { terminal: false, children: new Map() }
  // Index once rather than scanning every changed leaf for every visited field.
  // A terminal node includes its descendants (e.g. a replaced geometry or array).
  if (comparison && changesOnly) {
    for (const change of changes) {
      let node = changedPaths
      for (const segment of change.path) {
        let child = node.children.get(segment)
        if (!child) {
          child = { terminal: false, children: new Map() }
          node.children.set(segment, child)
        }
        node = child
      }
      node.terminal = true
    }
  }
  function visit(
    left: unknown,
    right: unknown,
    alignedParent: boolean,
    changedPath: ChangedPath | undefined,
    changedAncestor = false,
  ): ReleaseSampleField[] {
    const aligned = comparison ? languageEntries(left, right) : null
    const previous = new Map(aligned?.previous ?? entries(left))
    const current = new Map(aligned?.current ?? entries(right))
    return [...new Set([...previous.keys(), ...current.keys()])].flatMap(key => {
      const nextChangedPath = changedPath?.children.get(key)
      const includedByAncestor = changedAncestor || Boolean(changedPath?.terminal)
      if (
        comparison &&
        changesOnly &&
        !aligned &&
        !alignedParent &&
        !includedByAncestor &&
        !nextChangedPath
      )
        return []
      const oldValue = previous.get(key)
      const newValue = current.get(key)
      if (
        comparison &&
        changesOnly &&
        previous.has(key) === current.has(key) &&
        equalJson(oldValue, newValue)
      )
        return []
      const children = visit(
        oldValue,
        newValue,
        alignedParent || Boolean(aligned),
        nextChangedPath,
        includedByAncestor,
      )
      if (aligned && children.length) {
        const oldItem = new Map(entries(oldValue))
        const newItem = new Map(entries(newValue))
        for (const identityKey of [...aligned.identityKeys].reverse()) {
          if (children.some(child => child.key === identityKey)) continue
          if (
            identityKey !== 'language' &&
            !oldItem.has(identityKey) &&
            !newItem.has(identityKey)
          )
            continue
          children.unshift({
            key: identityKey,
            previousValue: display(
              oldItem.get(identityKey),
              oldItem.has(identityKey),
              absent,
            ),
            value: display(newItem.get(identityKey), newItem.has(identityKey), absent),
          })
        }
      }
      if (
        comparison &&
        changesOnly &&
        !children.length &&
        entries(oldValue).length &&
        entries(newValue).length &&
        Array.isArray(oldValue) === Array.isArray(newValue)
      )
        return []
      return [
        {
          key: Array.isArray(right) || Array.isArray(left) ? `[${key}]` : key,
          value: entries(newValue).length
            ? undefined
            : display(newValue, current.has(key), absent),
          previousValue:
            comparison && !entries(oldValue).length
              ? display(oldValue, previous.has(key), absent)
              : undefined,
          ...(children.length ? { children } : {}),
        },
      ]
    })
  }
  return visit(comparison ? before : after, after, false, changedPaths)
}

export function recordSummary(
  value: unknown,
  locale: string,
  fallback: string,
): { name: string; detail: string } {
  const record =
    value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
  const props =
    record.properties && typeof record.properties === 'object'
      ? (record.properties as Record<string, unknown>)
      : record
  const planningCodes = [
    ['PPU', props.ppu],
    ['SPU', props.spu],
    ['TPU', props.tpu],
    ['SB_VC', props.sbVc],
  ]
    .filter(
      (entry): entry is [string, string | number] =>
        (typeof entry[1] === 'string' && entry[1].trim().length > 0) ||
        typeof entry[1] === 'number',
    )
    .map(([label, code]) => `${label} ${code}`)
  function name(value: unknown): string | undefined {
    if (typeof value === 'string' && value.trim()) return value.trim()
    if (Array.isArray(value)) return value.map(name).find(Boolean)
    if (value && typeof value === 'object') {
      const local = value as Record<string, unknown>
      return (
        name(local[locale]) ??
        name(local[locale.toLowerCase()]) ??
        name(local.en) ??
        name(local.name) ??
        name(local.primary) ??
        name(local.common) ??
        name(local.value)
      )
    }
  }
  // Prefer the most specific geography, e.g. a building group within an HMA.
  // These are publisher labels, so retain both supplied languages in the header.
  function bilingual(fields: Record<string, unknown>, base: string) {
    const labels = [fields[`${base}ZhHant`], fields[`${base}En`]]
      .map(value => (typeof value === 'string' ? value.trim() : ''))
      .filter(Boolean)
    return [...new Set(labels)].join(' ') || undefined
  }
  const geographyName = ['bg', 'estate', 'newtown', 'newTown', 'hma', 'dc', 'area']
    .map(base => bilingual(props, base))
    .find(Boolean)
  const placeNames = Array.isArray(props.placeNames)
    ? props.placeNames.filter(
        (item): item is Record<string, unknown> =>
          item !== null && typeof item === 'object',
      )
    : []
  const officialPlace =
    placeNames.find(item => item.nameStatus === 'Official') ?? placeNames[0]
  const publisherName =
    geographyName ??
    name(props.name) ??
    name(props.names) ??
    name(props.label) ??
    name(props.translations) ??
    bilingual(props, 'name') ??
    (officialPlace ? bilingual(officialPlace, 'name') : undefined) ??
    name(props.roadName) ??
    name(props.stEngnm) ??
    name(props.address) ??
    ['buildingName', 'villageName', 'streetName', 'streetLocationName']
      .map(base => bilingual(props, base))
      .find(Boolean)
  const districtName = bilingual(props, 'dc')
  const year =
    typeof props.year === 'number' && Number.isFinite(props.year)
      ? String(props.year)
      : typeof props.year === 'string'
        ? props.year.trim()
        : ''
  const districtYearLabel =
    districtName && geographyName === districtName && year
      ? `${districtName} - ${year}`
      : undefined
  const codes = planningCodes.join(' · ')
  const identifier = [
    ['BG', props.bg],
    ['Estate', props.estate],
    ['New Town', props.newtown],
    ['HMA', props.hma],
    ['DC', props.dc],
    ['Area', props.areaCode],
    ['Place', props.geoNameId],
    ['Plate', props.snpId],
    ['Street', props.streetcode],
    ['Object', props.objectId],
  ].find(
    ([, value]) =>
      (typeof value === 'string' && value.trim()) ||
      (typeof value === 'number' && Number.isFinite(value)),
  )
  return {
    name:
      districtYearLabel ??
      publisherName ??
      (codes || (identifier ? identifier.join(' ') : fallback)),
    detail:
      planningCodes.length > 0
        ? publisherName
          ? codes
          : ''
        : [props.type, props.subtype, props.class, props.status]
            .filter((value): value is string => typeof value === 'string')
            .join(' · '),
  }
}

export function expandableFields(
  fields: ReleaseSampleField[],
  path: string[] = [],
): { id: string; expanded: boolean }[] {
  return fields.flatMap(field => {
    const next = [...path, field.key]
    return field.children?.length
      ? [
          { id: JSON.stringify(next), expanded: field.key !== 'geometry' },
          ...expandableFields(field.children, next),
        ]
      : []
  })
}
