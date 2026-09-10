import { resolveAlsCsuCorrection } from './hkgovAlsCsuCorrections'
import { resolveLinTsui } from './hkgovAlsLinTsui'
import {
  buildHkgovAlsPremiseIdentity,
  buildHkgovAlsProvisionalId,
} from './hkgovAlsIdentity.ts'
import {
  hkgovAlsPhaseFamily,
  normaliseHkgovAlsPhaseRomanNumeral,
  normaliseHkgovAlsBuildingNameRomanNumeral,
  normaliseHkgovAlsPremiseNumberRomanNumeral,
  normaliseHkgovAlsPremiseStructure,
  preferHkgovAlsEnglishCanonicalValue,
} from './hkgovAlsPremiseNormalisation.ts'
import type {
  DivisionLookupMaps,
  HkgovAlsFeature,
  HkgovLocalisedPremisesAddress,
  PreparedHkgovAlsRow,
} from './hkgovAlsTypes.ts'
import { resolveMappedDivision } from './hkgovAlsDivisions.ts'
import { AREA_NAME_ALIASES_EN, AREA_NAME_ALIASES_ZH } from './hkgovAlsConfig.ts'

/**
 * Finds estate-scoped English phase families that ALS represents numerically.
 * The preparation pass needs this release-wide context to repair Roman values
 * before the chunked address normaliser projects phase fields.
 */
export function collectHkgovAlsNumericPhaseFamilies(
  features: Iterable<HkgovAlsFeature>,
): ReadonlyMap<string, string> {
  const families = new Map<string, string>()

  for (const feature of features) {
    const premises = feature.properties?.Address?.PremisesAddress
    const english = premises?.EngPremisesAddress
    const englishEstateName = asOptionalString(english?.EngEstate?.EstateName)
    const phaseName = asOptionalString(english?.EngPhase?.PhaseName)
    const phaseRef = asOptionalString(english?.EngPhase?.PhaseNo)
    const family = hkgovAlsPhaseFamily(englishEstateName, phaseName, phaseRef)
    if (family && phaseName && hasNumericPhaseEvidence(phaseName, phaseRef)) {
      families.set(family, phaseName)
    }
  }

  return families
}

function hasNumericPhaseEvidence(phaseName: string | null, phaseNumber: string | null) {
  if (phaseNumber && /^[1-9]\d*[A-Z]?$/.test(phaseNumber)) return true
  return Boolean(phaseName && /(?:^|\s)[1-9]\d*[A-Z]?$/i.test(phaseName))
}

export function normaliseHkgovAlsFeature(
  feature: HkgovAlsFeature,
  sourceFile: string,
  sourceFeatureIndexOneBased: number,
  cohortKey: string,
  sourceVersion: string,
  divisionMaps: DivisionLookupMaps,
  postProcessPremiseStructure: boolean,
  romanNumeralBuildingNameFamilies: ReadonlyMap<string, string>,
  romanNumeralPremiseNumberFamilies: ReadonlyMap<string, string>,
  numericPhaseFamilies: ReadonlyMap<string, string>,
): PreparedHkgovAlsRow {
  const properties = feature.properties ?? {}
  const linTsui = resolveLinTsui(feature, sourceVersion)
  const effectiveGeometry = linTsui?.named
    ? { type: 'Point', coordinates: linTsui.coordinates }
    : feature.geometry
  const premises = properties.Address?.PremisesAddress ?? {}
  const rawZh = premises.ChiPremisesAddress ?? {}
  const rawEn = premises.EngPremisesAddress ?? {}
  const enPhaseRomanNumeralNormalisation = postProcessPremiseStructure
    ? normaliseHkgovAlsPhaseRomanNumeral({
        estateName: asOptionalString(rawEn.EngEstate?.EstateName),
        numericPhaseFamilies,
        phaseName: asOptionalString(rawEn.EngPhase?.PhaseName),
        phaseRef: asOptionalString(rawEn.EngPhase?.PhaseNo),
      })
    : null
  const enBuildingNameRomanNumeralNormalisation = postProcessPremiseStructure
    ? normaliseHkgovAlsBuildingNameRomanNumeral({
        buildingName: asOptionalString(rawEn.BuildingName),
        romanNumeralFamilies: romanNumeralBuildingNameFamilies,
      })
    : null
  const rawEnStructure = {
    blockDescriptor: asOptionalString(rawEn.EngBlock?.BlockDescriptor),
    blockNumber: asOptionalString(rawEn.EngBlock?.BlockNo),
    buildingName:
      enBuildingNameRomanNumeralNormalisation?.to ??
      asOptionalString(rawEn.BuildingName),
    estateName: asOptionalString(rawEn.EngEstate?.EstateName),
  }
  const rawZhStructure = {
    blockDescriptor: asOptionalString(rawZh.ChiBlock?.BlockDescriptor),
    blockNumber: asOptionalString(rawZh.ChiBlock?.BlockNo),
    buildingName: asOptionalString(rawZh.BuildingName),
    estateName: asOptionalString(rawZh.ChiEstate?.EstateName),
  }
  const normalisedEnStructure = postProcessPremiseStructure
    ? normaliseHkgovAlsPremiseStructure(rawEnStructure)
    : { ...rawEnStructure, normalisation: 'none' as const }
  const enBlockNumberRomanNumeralNormalisation = postProcessPremiseStructure
    ? normaliseHkgovAlsPremiseNumberRomanNumeral({
        premise: normalisedEnStructure,
        romanNumeralFamilies: romanNumeralPremiseNumberFamilies,
      })
    : null
  const enStructure = enBlockNumberRomanNumeralNormalisation
    ? {
        ...normalisedEnStructure,
        blockNumber: enBlockNumberRomanNumeralNormalisation.to,
      }
    : normalisedEnStructure
  const zhStructure = postProcessPremiseStructure
    ? normaliseHkgovAlsPremiseStructure(rawZhStructure)
    : { ...rawZhStructure, normalisation: 'none' as const }
  const en: HkgovLocalisedPremisesAddress = {
    ...rawEn,
    BuildingName: enStructure.buildingName,
    EngBlock: {
      ...rawEn.EngBlock,
      BlockDescriptor: enStructure.blockDescriptor,
      BlockNo: enStructure.blockNumber,
    },
    EngEstate: { ...rawEn.EngEstate, EstateName: enStructure.estateName },
    EngPhase: {
      ...rawEn.EngPhase,
      PhaseName: enPhaseRomanNumeralNormalisation?.to ?? rawEn.EngPhase?.PhaseName,
    },
  }
  const zh: HkgovLocalisedPremisesAddress = {
    ...rawZh,
    BuildingName: zhStructure.buildingName,
    ChiBlock: {
      ...rawZh.ChiBlock,
      BlockDescriptor: zhStructure.blockDescriptor,
      BlockNo: zhStructure.blockNumber,
    },
    ChiEstate: { ...rawZh.ChiEstate, EstateName: zhStructure.estateName },
  }
  const zhStreet = zh.ChiStreet ?? {}
  const enStreet = en.EngStreet ?? {}
  const zhVillage = zh.ChiVillage ?? {}
  const enVillage = en.EngVillage ?? {}
  const blockDescriptorPrecedenceIndicator = asOptionalString(
    en.EngBlock?.BlockDescriptorPrecedenceIndicator,
  )
  const geoAddress = asOptionalString(premises.GeoAddress)
  const csuCorrection = resolveAlsCsuCorrection(feature, sourceVersion)
  const csuId = csuCorrection.csu
  const identityBuildingId = csuId ?? geoAddress
  if (!identityBuildingId) {
    throw new Error(`ALS feature in ${sourceFile} is missing GeoAddress and CsuId.`)
  }
  const identityRouteNames = [
    asOptionalString(enStreet.StreetName),
    asOptionalString(enVillage.VillageName),
    asOptionalString(enVillage.LocationName),
    asOptionalString(zhStreet.StreetName),
    asOptionalString(zhVillage.VillageName),
    asOptionalString(zhVillage.LocationName),
  ].filter((value): value is string => Boolean(value))
  const identityNumberFrom =
    asOptionalString(enStreet.BuildingNoFrom) ??
    asOptionalString(enVillage.BuildingNoFrom) ??
    asOptionalString(zhStreet.BuildingNoFrom) ??
    asOptionalString(zhVillage.BuildingNoFrom)
  const identityNumberTo =
    asOptionalString(enStreet.BuildingNoTo) ??
    asOptionalString(enVillage.BuildingNoTo) ??
    asOptionalString(zhStreet.BuildingNoTo) ??
    asOptionalString(zhVillage.BuildingNoTo)
  const areaNameEn = resolveAreaNameEn(en.Region)
  const areaNameZhHant = resolveAreaNameZh(zh.Region)
  const districtNameEn = asOptionalString(en.EngDistrict)
  const districtNameZhHant = asOptionalString(zh.ChiDistrict)
  const areaMatch = resolveMappedDivision({
    byEn: divisionMaps.areaByEn,
    byZh: divisionMaps.areaByZh,
    ambiguousEn: divisionMaps.ambiguousAreaEn,
    ambiguousZh: divisionMaps.ambiguousAreaZh,
    en: areaNameEn,
    zh: areaNameZhHant,
  })
  const districtMatch = resolveMappedDivision({
    byEn: divisionMaps.districtByEn,
    byZh: divisionMaps.districtByZh,
    ambiguousEn: divisionMaps.ambiguousDistrictEn,
    ambiguousZh: divisionMaps.ambiguousDistrictZh,
    en: districtNameEn,
    zh: districtNameZhHant,
  })
  const areaId = areaMatch.id
  const districtId = districtMatch.id
  const coordinates =
    effectiveGeometry?.type === 'Point' && Array.isArray(effectiveGeometry.coordinates)
      ? effectiveGeometry.coordinates
      : null
  const routeKind =
    enStreet.StreetName || zhStreet.StreetName
      ? 'street'
      : enVillage.VillageName ||
          enVillage.LocationName ||
          zhVillage.VillageName ||
          zhVillage.LocationName
        ? 'village'
        : 'unknown'
  const routeName =
    asOptionalString(enStreet.StreetName) ??
    asOptionalString(enVillage.VillageName) ??
    asOptionalString(enVillage.LocationName) ??
    asOptionalString(zhStreet.StreetName) ??
    asOptionalString(zhVillage.VillageName) ??
    asOptionalString(zhVillage.LocationName)
  const premiseIdentity = buildHkgovAlsPremiseIdentity({
    blockDescriptor:
      asOptionalString(en.EngBlock?.BlockDescriptor) ??
      asOptionalString(zh.ChiBlock?.BlockDescriptor),
    blockNumber:
      asOptionalString(en.EngBlock?.BlockNo) ?? asOptionalString(zh.ChiBlock?.BlockNo),
    buildingName: preferHkgovAlsEnglishCanonicalValue({
      canonicalChinese: asOptionalString(zh.BuildingName),
      canonicalEnglish: asOptionalString(en.BuildingName),
      rawEnglish: asOptionalString(rawEn.BuildingName),
    }),
    csuId,
    districtName: districtNameEn ?? districtNameZhHant,
    estateName:
      asOptionalString(en.EngEstate?.EstateName) ??
      asOptionalString(zh.ChiEstate?.EstateName),
    geoAddress,
    latitude: coordinates?.[1] ?? null,
    longitude: coordinates?.[0] ?? null,
    numberFrom: identityNumberFrom,
    numberTo: identityNumberTo,
    phaseName:
      asOptionalString(en.EngPhase?.PhaseName) ??
      asOptionalString(zh.ChiPhase?.PhaseName),
    phaseNumber:
      asOptionalString(en.EngPhase?.PhaseNo) ?? asOptionalString(zh.ChiPhase?.PhaseNo),
    routeKind,
    routeName,
    unitDescriptor:
      asOptionalString(en.EngUnit?.UnitDescriptor) ??
      asOptionalString(zh.ChiUnit?.UnitDescriptor),
    unitNumber:
      asOptionalString(en.EngUnit?.UnitNo) ?? asOptionalString(zh.ChiUnit?.UnitNo),
  })
  const provisionalId = buildHkgovAlsProvisionalId(premiseIdentity.identityKey)
  const sources =
    stringifyJson({
      ...(linTsui ? { hkgovAlsLinTsui: { ...linTsui, rawFeature: feature } } : {}),
      ...(csuCorrection.decision
        ? { hkgovAlsCsuCorrection: csuCorrection.decision }
        : {}),
      hkgovAls: {
        geoAddress,
        hkgovCsuId: asOptionalString(premises.BuildingCsuInformation?.CsuId),
        cohortKey,
        sourceFile,
        premiseNormalisation: {
          en: enStructure.normalisation,
          enBuildingNameRomanNumeral: enBuildingNameRomanNumeralNormalisation != null,
          enBlockNumberRomanNumeral: enBlockNumberRomanNumeralNormalisation != null,
          enPhaseRomanNumeral: enPhaseRomanNumeralNormalisation != null,
          zhHant: zhStructure.normalisation,
        },
      },
    }) ?? '{}'

  return {
    id: provisionalId,
    canonicalId: provisionalId,
    theme: 'addresses',
    type: 'address',
    country: 'HK',
    region: 'HK',
    cohortKey,
    sourceVersion,
    sourceFile,
    sourceFeatureIndexOneBased,
    geometry: stringifyJson(effectiveGeometry ?? null),
    identifiers: csuId ? stringifyJson({ hkgovCsuId: csuId }) : null,
    sources,
    divisionSnapshotId: divisionMaps.snapshotId,
    areaId,
    areaMatchStatus: areaMatch.status,
    districtId,
    districtMatchStatus: districtMatch.status,
    countryId: divisionMaps.countryId,
    areaNameEn,
    areaNameZhHant,
    districtNameEn,
    districtNameZhHant,
    geoAddress,
    hkgovCsuId: csuId,
    identityAlias: null,
    identityBuildingId,
    identityContinuityKey: premiseIdentity.continuityKey,
    identityKey: premiseIdentity.identityKey,
    identityMatchMethod: 'als-premise',
    blockDescriptorPrecedenceIndicator,
    identityNumberFrom,
    identityNumberTo,
    identityRouteNames: JSON.stringify(identityRouteNames),
    identitySummary: premiseIdentity.summary,
    // Preserve the official representation verbatim; canonical component fields
    // below carry the narrowly-scoped post-processing used by the service.
    chiPremisesAddressJson: stringifyJson(rawZh),
    engPremisesAddressJson: stringifyJson(rawEn),
    zhHantFormattedAddress: formatZhPremisesAddress(zh),
    zhHantRegion: asOptionalString(zh.Region),
    zhHantDistrict: districtNameZhHant,
    zhHantEstateName: asOptionalString(zh.ChiEstate?.EstateName),
    zhHantBuildingName: asOptionalString(zh.BuildingName),
    zhHantBlockDescriptor: asOptionalString(zh.ChiBlock?.BlockDescriptor),
    zhHantBlockNumber: asOptionalString(zh.ChiBlock?.BlockNo),
    zhHantPhaseName: asOptionalString(zh.ChiPhase?.PhaseName),
    zhHantPhaseRef: asOptionalString(zh.ChiPhase?.PhaseNo),
    zhHantStreetName: asOptionalString(zhStreet.StreetName),
    zhHantStreetNumberFrom: asOptionalString(zhStreet.BuildingNoFrom),
    zhHantStreetNumberTo: asOptionalString(zhStreet.BuildingNoTo),
    zhHantVillageName:
      asOptionalString(zhVillage.VillageName) ??
      asOptionalString(zhVillage.LocationName),
    zhHantVillageNumberFrom: asOptionalString(zhVillage.BuildingNoFrom),
    zhHantVillageNumberTo: asOptionalString(zhVillage.BuildingNoTo),
    enFormattedAddress: formatEnPremisesAddress(en),
    enRegion: asOptionalString(en.Region),
    enDistrict: districtNameEn,
    enEstateName: asOptionalString(en.EngEstate?.EstateName),
    enBuildingName: asOptionalString(en.BuildingName),
    enBuildingNameRomanNumeralNormalisation,
    enBlockDescriptor: asOptionalString(en.EngBlock?.BlockDescriptor),
    enBlockNumber: asOptionalString(en.EngBlock?.BlockNo),
    enBlockNumberRomanNumeralNormalisation,
    enStreetName: asOptionalString(enStreet.StreetName),
    enStreetNumberFrom: asOptionalString(enStreet.BuildingNoFrom),
    enStreetNumberTo: asOptionalString(enStreet.BuildingNoTo),
    enVillageName:
      asOptionalString(enVillage.VillageName) ??
      asOptionalString(enVillage.LocationName),
    enVillageNumberFrom: asOptionalString(enVillage.BuildingNoFrom),
    enVillageNumberTo: asOptionalString(enVillage.BuildingNoTo),
    enPhaseName: asOptionalString(en.EngPhase?.PhaseName),
    enPhaseRef: asOptionalString(en.EngPhase?.PhaseNo),
    enPhaseRomanNumeralNormalisation,
    easting: asOptionalInteger(properties.Easting),
    northing: asOptionalInteger(properties.Northing),
  }
}

export function sqlLiteral(value: string) {
  return `'${value.replaceAll("'", "''")}'`
}

function resolveAreaNameEn(value: unknown) {
  const normalised = asOptionalString(value)

  if (!normalised) {
    return null
  }

  return AREA_NAME_ALIASES_EN.get(normaliseEnKey(normalised)) ?? normalised
}

function resolveAreaNameZh(value: unknown) {
  const normalised = asOptionalString(value)

  if (!normalised) {
    return null
  }

  return AREA_NAME_ALIASES_ZH.get(normaliseZhKey(normalised)) ?? normalised
}

export function formatZhPremisesAddress(address: HkgovLocalisedPremisesAddress) {
  const street = address.ChiStreet ?? {}
  const village = address.ChiVillage ?? {}
  const block = address.ChiBlock ?? {}
  const routeLine =
    compactAddress(
      [
        joinStreetNumberRange(street.BuildingNoFrom, street.BuildingNoTo, ''),
        asOptionalString(street.StreetName),
      ],
      '',
    ) ??
    compactAddress(
      [
        joinStreetNumberRange(village.BuildingNoFrom, village.BuildingNoTo, ''),
        asOptionalString(village.VillageName),
        asOptionalString(village.LocationName),
      ],
      '',
    )
  const parts = [
    asOptionalString(address.BuildingName),
    compactAddress(
      [asOptionalString(block.BlockDescriptor), asOptionalString(block.BlockNo)],
      '',
    ),
    asOptionalString(address.ChiEstate?.EstateName),
    routeLine,
    asOptionalString(address.ChiDistrict),
    asOptionalString(address.Region),
  ]

  return compactAddress(parts, '')
}

export function formatEnPremisesAddress(address: HkgovLocalisedPremisesAddress) {
  const street = address.EngStreet ?? {}
  const village = address.EngVillage ?? {}
  const block = address.EngBlock ?? {}
  const streetLine = compactAddress(
    [
      joinStreetNumberRange(street.BuildingNoFrom, street.BuildingNoTo, '-'),
      asOptionalString(street.StreetName),
    ],
    ' ',
  )
  const villageLine = compactAddress(
    [
      joinStreetNumberRange(village.BuildingNoFrom, village.BuildingNoTo, '-'),
      asOptionalString(village.VillageName),
      asOptionalString(village.LocationName),
    ],
    ', ',
  )
  const parts = [
    asOptionalString(address.BuildingName),
    compactAddress(
      [asOptionalString(block.BlockDescriptor), asOptionalString(block.BlockNo)],
      ' ',
    ),
    asOptionalString(address.EngEstate?.EstateName),
    streetLine ?? villageLine,
    asOptionalString(address.EngDistrict),
    asOptionalString(address.Region),
  ]

  return compactAddress(parts, ', ')
}

export function compactAddress(parts: Array<string | null>, separator: string) {
  const filtered = parts.filter((value): value is string => Boolean(value))
  return filtered.length > 0 ? filtered.join(separator) : null
}

export function joinStreetNumberRange(
  from: unknown,
  to: unknown,
  separator: string,
): string | null {
  const fromValue = asOptionalString(from)
  const toValue = asOptionalString(to)

  if (!fromValue && !toValue) {
    return null
  }

  if (fromValue && toValue && fromValue !== toValue) {
    return `${fromValue}${separator}${toValue}`
  }

  return fromValue ?? toValue
}

export function asOptionalString(value: unknown) {
  if (typeof value === 'number' || typeof value === 'bigint') {
    return String(value)
  }

  if (typeof value !== 'string') {
    return null
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function asOptionalInteger(value: unknown) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null
  }

  return Math.trunc(value)
}

export function normaliseEnKey(value: string) {
  return value.trim().replace(/\s+/g, ' ').toUpperCase()
}

export function normaliseZhKey(value: string) {
  return value.trim().replace(/\s+/g, '')
}

function stringifyJson(value: unknown) {
  if (value === null || value === undefined) {
    return null
  }

  return JSON.stringify(value)
}

export function stringColumn(
  name: string,
  data: Array<string | null>,
  nullable = true,
) {
  return {
    name,
    data,
    nullable,
    type: 'STRING' as const,
  }
}

export function jsonColumn(name: string, data: Array<string | null>, nullable = true) {
  return {
    name,
    data,
    nullable,
    type: 'STRING' as const,
  }
}

export function int32Column(name: string, data: Array<number | null>, nullable = true) {
  return {
    name,
    data,
    nullable,
    type: 'INT32' as const,
  }
}
