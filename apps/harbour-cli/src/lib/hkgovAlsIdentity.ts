import { buildDeterministicUuidV5 } from '@repo/db'

const ALS_ADDRESS_ID_NAMESPACE = 'ac5f6d22-6c45-5b61-8f56-5f31fc39cd5d'

export type HkgovAlsPremiseIdentityInput = {
  blockDescriptor: string | null
  blockNumber: string | null
  buildingName: string | null
  csuId: string | null
  districtName: string | null
  estateName: string | null
  geoAddress: string | null
  latitude: number | null
  longitude: number | null
  numberFrom: string | null
  numberTo: string | null
  phaseName: string | null
  phaseNumber: string | null
  routeKind: 'street' | 'village' | 'unknown'
  routeName: string | null
  unitDescriptor: string | null
  unitNumber: string | null
}

export type HkgovAlsPremiseIdentityDescriptor = {
  continuityKey: string
  identityKey: string
  numberlessIdentityKey: string
  summary: Record<string, string | null>
}

export function buildHkgovAlsPremiseIdentity(
  input: HkgovAlsPremiseIdentityInput,
): HkgovAlsPremiseIdentityDescriptor {
  const buildingReference = token(input.csuId) || token(input.geoAddress)
  if (!buildingReference) {
    throw new Error('ALS premise is missing both CsuId and GeoAddress.')
  }

  const summary = {
    blockDescriptor: value(input.blockDescriptor),
    blockNumber: value(input.blockNumber),
    buildingName: value(input.buildingName),
    csuId: value(input.csuId),
    districtName: value(input.districtName),
    estateName: value(input.estateName),
    geoAddress: value(input.geoAddress),
    latitude: input.latitude == null ? null : input.latitude.toFixed(5),
    longitude: input.longitude == null ? null : input.longitude.toFixed(5),
    numberFrom: value(input.numberFrom),
    numberTo: value(input.numberTo),
    phaseName: value(input.phaseName),
    phaseNumber: value(input.phaseNumber),
    routeKind: input.routeKind,
    routeName: value(input.routeName),
    unitDescriptor: value(input.unitDescriptor),
    unitNumber: value(input.unitNumber),
  }

  return {
    continuityKey: joinIdentityParts([
      'hkgov-als-premise-continuity-v1',
      summary.csuId ?? summary.geoAddress,
      summary.districtName,
      summary.routeKind,
      summary.routeName,
      summary.numberFrom,
      summary.numberTo,
      summary.longitude,
      summary.latitude,
    ]),
    identityKey: joinIdentityParts([
      'hkgov-als-premise-v1',
      buildingReference,
      summary.districtName,
      summary.routeKind,
      summary.routeName,
      summary.numberFrom,
      summary.numberTo,
      summary.estateName,
      summary.phaseName,
      summary.phaseNumber,
      summary.blockDescriptor,
      summary.blockNumber,
      summary.buildingName,
      summary.unitDescriptor,
      summary.unitNumber,
    ]),
    numberlessIdentityKey: joinIdentityParts([
      'hkgov-als-premise-without-number-v1',
      buildingReference,
      summary.districtName,
      summary.routeKind,
      summary.routeName,
      summary.estateName,
      summary.phaseName,
      summary.phaseNumber,
      summary.blockDescriptor,
      summary.blockNumber,
      summary.buildingName,
      summary.unitDescriptor,
      summary.unitNumber,
    ]),
    summary,
  }
}

export function buildHkgovAlsProvisionalId(identityKey: string) {
  return `ss-${buildDeterministicUuidV5(ALS_ADDRESS_ID_NAMESPACE, identityKey)}`
}

function joinIdentityParts(values: Array<string | null>) {
  return values.map(value => token(value)).join('\u0000')
}

function token(value: unknown) {
  return typeof value === 'string' && value.trim()
    ? value
        .normalize('NFKC')
        .trim()
        .toUpperCase()
        .replace(/[\p{P}\p{S}_]+/gu, ' ')
        .replace(/\s+/g, ' ')
    : ''
}

function value(input: string | null) {
  return input?.trim() || null
}
