import { alsReviewScope } from './hkgovAlsReviewPolicy'
import { asyncBufferFromFile, parquetReadObjects } from 'hyparquet'
import { compressors } from 'hyparquet-compressors'
import { dirname, resolve } from 'node:path'
import { existsSync } from 'node:fs'
import { fileSha256 } from '../../../pipeline/addresses/address3dImport'
import type { HkgovAlsIdentityHistory } from './hkgovAlsDrift'
import type { PreparedHkgovAlsRow } from './hkgovAlsTypes'
import {
  formatEnPremisesAddress,
  formatZhPremisesAddress,
} from './hkgovAlsNormalisation'

export function continuityPredecessorPath(
  outputFile: string,
  sourceVersion: string,
  history: HkgovAlsIdentityHistory,
) {
  if (!alsReviewScope('confident-continuity', sourceVersion)) return null
  const version = history.entries.reduce(
    (latest, e) =>
      e.sourceVersion < sourceVersion && e.sourceVersion > latest
        ? e.sourceVersion
        : latest,
    '',
  )
  const path = resolve(dirname(outputFile), `hkgov-hk-${version}-address.parquet`)
  return version && existsSync(path) ? path : null
}
export async function continuityPredecessorFingerprint(
  outputFile: string,
  sourceVersion: string,
  history: HkgovAlsIdentityHistory,
) {
  const path = continuityPredecessorPath(outputFile, sourceVersion, history)
  return path ? { path, sha256: await fileSha256(path) } : null
}
const components = [
  'enStreetName',
  'zhHantStreetName',
  'enStreetNumberFrom',
  'zhHantStreetNumberFrom',
  'enStreetNumberTo',
  'zhHantStreetNumberTo',
  'enVillageName',
  'zhHantVillageName',
  'enVillageNumberFrom',
  'zhHantVillageNumberFrom',
  'enVillageNumberTo',
  'zhHantVillageNumberTo',
  'enBlockNumber',
  'zhHantBlockNumber',
  'enPhaseName',
  'zhHantPhaseName',
  'enPhaseRef',
  'zhHantPhaseRef',
] as const
const names = [
  'enBuildingName',
  'zhHantBuildingName',
  'enEstateName',
  'zhHantEstateName',
] as const
const roman = (s: string | null) =>
  s?.replace(
    /\b(TOWER|BLOCK|BLK) (III|II|IV|I)\b/g,
    (_, kind, n) => `${kind} ${{ I: 1, II: 2, III: 3, IV: 4 }[n as 'I']}`,
  ) ?? null
const equal = (
  a: PreparedHkgovAlsRow,
  b: PreparedHkgovAlsRow,
  keys: readonly (keyof PreparedHkgovAlsRow)[],
) => keys.every(k => (a[k] ?? null) === (b[k] ?? null))
const route = (r: PreparedHkgovAlsRow) => ({
  en: r.enStreetName ?? r.enVillageName,
  zh: r.zhHantStreetName ?? r.zhHantVillageName,
  number: r.enStreetNumberFrom ?? r.enVillageNumberFrom,
  to: r.enStreetNumberTo ?? r.enVillageNumberTo,
})
const location = (r: PreparedHkgovAlsRow) =>
  r.geometry ? JSON.stringify(JSON.parse(r.geometry).coordinates) : null

/** One-to-one continuations only; coordinate proximity never establishes identity. */
export function applyConfidentAlsContinuity(
  rows: PreparedHkgovAlsRow[],
  previous: PreparedHkgovAlsRow[],
  version: string,
) {
  const aliases = new Map<string, string>()
  const scope = alsReviewScope('confident-continuity', version)
  if (!scope) return aliases
  const ids = new Set(rows.map(r => r.id)),
    priorIds = new Set(previous.map(r => r.id))
  const proposals: Array<{
    row: PreparedHkgovAlsRow
    old: PreparedHkgovAlsRow
    kind: string
  }> = []
  const byCsu = new Map<string, PreparedHkgovAlsRow[]>(),
    byText = new Map<string, PreparedHkgovAlsRow[]>()
  const textKey = (r: PreparedHkgovAlsRow) =>
    JSON.stringify([r.enFormattedAddress, r.zhHantFormattedAddress, location(r)])
  for (const row of rows) {
    if (row.hkgovCsuId)
      byCsu.set(row.hkgovCsuId, [...(byCsu.get(row.hkgovCsuId) ?? []), row])
    byText.set(textKey(row), [...(byText.get(textKey(row)) ?? []), row])
  }
  for (const old of previous) {
    if (ids.has(old.id) || !location(old)) continue
    const exact = (byText.get(textKey(old)) ?? []).filter(
      r =>
        !priorIds.has(r.id) &&
        equal(old, r, [
          ...components,
          ...names,
          'parentAddressId',
          'curatedGranularity',
        ]),
    )
    if (exact.length === 1) {
      proposals.push({ row: exact[0]!, old, kind: 'exact-bilingual-address' })
      continue
    }
    const matches = (byCsu.get(old.hkgovCsuId ?? '') ?? []).filter(
      r =>
        !priorIds.has(r.id) &&
        location(r) === location(old) &&
        equal(old, r, ['parentAddressId']),
    )
    if (matches.length !== 1) continue
    const row = matches[0]!,
      next = route(row)
    const priorRoute = route(old)
    if (
      old.curatedGranularity === 'unknown' &&
      old.enEstateName &&
      !old.enBuildingName &&
      !old.enBlockNumber &&
      !row.enBuildingName &&
      !row.enEstateName &&
      !row.enBlockNumber &&
      priorRoute.en === next.en &&
      priorRoute.zh === next.zh &&
      priorRoute.number === next.number &&
      priorRoute.to === next.to
    ) {
      proposals.push({ row, old, kind: 'house-prefix-to-street-number' })
      continue
    }
    const blockValue = (value: string | null) =>
      ({
        I: '1',
        II: '2',
        III: '3',
        IV: '4',
        V: '5',
        VI: '6',
        VII: '7',
        VIII: '8',
        IX: '9',
        X: '10',
      })[value as 'I'] ?? value
    if (
      old.enBlockDescriptor === 'TOWER' &&
      row.enBlockDescriptor === 'TOWER' &&
      equal(old, row, [
        ...components.filter(k => !['enBlockNumber', 'zhHantBlockNumber'].includes(k)),
        ...names,
        'curatedGranularity',
      ]) &&
      blockValue(old.enBlockNumber) === blockValue(row.enBlockNumber) &&
      blockValue(old.zhHantBlockNumber) === blockValue(row.zhHantBlockNumber)
    ) {
      proposals.push({ row, old, kind: 'number-or-block-formatting' })
      continue
    }
    if (
      equal(old, row, components) &&
      equal(old, row, ['enEstateName', 'zhHantEstateName', 'curatedGranularity']) &&
      roman(old.enBuildingName) === roman(row.enBuildingName) &&
      old.zhHantBuildingName === row.zhHantBuildingName
    ) {
      proposals.push({ row, old, kind: 'number-or-block-formatting' })
      continue
    }
    const sitePart = /\b(PODIUM|SHOP|CAR PARK|BASEMENT|ANNEX|WING)\b/
    if (
      equal(old, row, components) &&
      !sitePart.test(old.enBuildingName ?? '') &&
      names.every(k => !row[k] || row[k] === old[k]) &&
      names.some(k => old[k] && !row[k])
    ) {
      proposals.push({ row, old, kind: 'preserve-omitted-premise-name' })
      continue
    }
    if (
      /^(HOUSE|HSE)$/i.test(old.enBlockDescriptor ?? '') &&
      old.enBlockNumber === next.number &&
      !next.to &&
      !row.enBuildingName &&
      !row.enEstateName &&
      !row.enBlockNumber &&
      ((old.enBuildingName === next.en && old.zhHantBuildingName === next.zh) ||
        (old.enVillageName === next.en && old.zhHantVillageName === next.zh)) &&
      old.enEstateName
    ) {
      proposals.push({ row, old, kind: 'house-prefix-to-street-number' })
    }
  }
  const targetCounts = new Map<string, number>()
  for (const p of proposals)
    targetCounts.set(p.row.id, (targetCounts.get(p.row.id) ?? 0) + 1)
  for (const { row, old, kind } of proposals) {
    if (targetCounts.get(row.id) !== 1) continue
    const candidateId = row.id,
      en = JSON.parse(row.engPremisesAddressJson ?? '{}'),
      zh = JSON.parse(row.chiPremisesAddressJson ?? '{}')
    if (kind === 'preserve-omitted-premise-name') {
      for (const k of names) if (!row[k]) row[k] = old[k]
      if (row.enBuildingName) en.BuildingName = row.enBuildingName
      if (row.zhHantBuildingName) zh.BuildingName = row.zhHantBuildingName
      if (row.enEstateName)
        en.EngEstate = { ...en.EngEstate, EstateName: row.enEstateName }
      if (row.zhHantEstateName)
        zh.ChiEstate = { ...zh.ChiEstate, EstateName: row.zhHantEstateName }
      row.curatedGranularity =
        old.curatedGranularity ?? (old.enBuildingName ? 'building' : 'complex')
    }
    if (kind === 'house-prefix-to-street-number') {
      const street = route(row)
      row.enEstateName = old.enEstateName
      row.zhHantEstateName = old.zhHantEstateName
      en.EngEstate = {
        ...JSON.parse(old.engPremisesAddressJson ?? '{}').EngEstate,
        EstateName: row.enEstateName,
      }
      zh.ChiEstate = {
        ...JSON.parse(old.chiPremisesAddressJson ?? '{}').ChiEstate,
        EstateName: row.zhHantEstateName,
      }
      row.enPhaseName = old.enPhaseName
      row.zhHantPhaseName = old.zhHantPhaseName
      row.enPhaseRef = old.enPhaseRef
      row.zhHantPhaseRef = old.zhHantPhaseRef
      row.enStreetName = street.en
      row.zhHantStreetName = street.zh
      row.enStreetNumberFrom = row.zhHantStreetNumberFrom = street.number
      row.enVillageName =
        row.zhHantVillageName =
        row.enVillageNumberFrom =
        row.zhHantVillageNumberFrom =
        row.enVillageNumberTo =
        row.zhHantVillageNumberTo =
          null
      en.EngStreet = { StreetName: street.en, BuildingNoFrom: street.number }
      zh.ChiStreet = { StreetName: street.zh, BuildingNoFrom: street.number }
      delete en.EngVillage
      delete zh.ChiVillage
      row.curatedGranularity = 'unknown'
    }
    if (
      kind === 'preserve-omitted-premise-name' ||
      kind === 'house-prefix-to-street-number'
    ) {
      row.enFormattedAddress = formatEnPremisesAddress(en)
      row.zhHantFormattedAddress = formatZhPremisesAddress(zh)
    }
    row.hierarchyCuration = JSON.stringify({
      id: scope.id,
      authority: scope.authority,
      kind,
    })
    row.id = row.canonicalId = row.identityBuildingId = old.id
    row.identityAlias = candidateId
    row.identityMatchMethod = scope.id
    row.sources = JSON.stringify({
      ...JSON.parse(row.sources),
      hkgovAlsConfidentContinuity: {
        authority: scope.authority,
        kind,
        confidence: 'high',
        previousId: old.id,
        previousSourceVersion: old.sourceVersion,
        previousAddress: {
          en: old.enFormattedAddress,
          'zh-Hant': old.zhHantFormattedAddress,
        },
        candidateId,
        originalGeometry: row.geometry,
      },
    })
    aliases.set(candidateId, old.id)
    for (const alias of JSON.parse(old.sources).reviewedIdentityAliases ?? [])
      aliases.set(alias, old.id)
  }
  return aliases
}

export async function applyConfidentAlsContinuityFromHistory(
  rows: PreparedHkgovAlsRow[],
  outputFile: string,
  sourceVersion: string,
  history: HkgovAlsIdentityHistory,
) {
  const path = continuityPredecessorPath(outputFile, sourceVersion, history)
  if (!path) return new Map<string, string>()
  const prior = await parquetReadObjects({
    file: await asyncBufferFromFile(path),
    compressors,
    columns: [
      'id',
      'sourceVersion',
      'hkgovCsuId',
      'geometry',
      'enFormattedAddress',
      'zhHantFormattedAddress',
      'parentAddressId',
      'curatedGranularity',
      'sources',
      'enBlockDescriptor',
      ...components.filter(key => !key.includes('VillageNumber')),
      'engPremisesAddressJson',
      'chiPremisesAddressJson',
      ...names,
    ],
  })
  for (const row of prior) {
    const en = JSON.parse(String(row.engPremisesAddressJson ?? '{}')).EngVillage
    const zh = JSON.parse(String(row.chiPremisesAddressJson ?? '{}')).ChiVillage
    for (const [prefix, value] of [
      ['en', en],
      ['zhHant', zh],
    ] as const) {
      row[`${prefix}VillageNumberFrom`] =
        value?.BuildingNoFrom == null ? null : String(value.BuildingNoFrom)
      row[`${prefix}VillageNumberTo`] =
        value?.BuildingNoTo == null ? null : String(value.BuildingNoTo)
    }
  }
  return applyConfidentAlsContinuity(
    rows,
    prior as PreparedHkgovAlsRow[],
    sourceVersion,
  )
}
