import { requireDefined } from '../../../requireDefined'
import {
  addressScopes,
  addressPremisesKinds,
  type AddressPremisesKind,
  buildDeterministicUuidV5,
  type AddressScope,
  type AddressPremisesType,
} from '@repo/db'
import fixture from '../../../../../../fixtures/meta/curations/address-scope.json'

const POLICY_VERSION = 2
/** Transient review output. Persist reviewed decisions in the curation fixture only. */
export type AddressScopeReview = {
  method: 'heuristic' | 'curated' | 'unknown'
  policyVersion: number
  inputFingerprint: string
  rule: string
  evidence: string[]
  reviewReason: string | null
  curation?: { id: string; revision: number; reason: string }
}
const FINGERPRINT_NAMESPACE = '24b97370-0890-5c80-a3b8-6d7a8eb59644'
const componentFields = [
  'formattedAddress',
  'buildingName',
  'buildingNumberExpression',
  'buildingNumberFrom',
  'buildingNumberTo',
  'blockExpression',
  'blockType',
  'blockRef',
  'phaseExpression',
  'phaseName',
  'phaseRef',
  'premisesName',
  'streetName',
] as const

export type ScopeComponents = { locale: string } & Partial<
  Record<(typeof componentFields)[number], string | null>
>

export type AddressScopeCuration = {
  version: 1
  overrides: Array<{
    id: string
    revision: number
    addressId: string
    inputFingerprint: string
    scope: AddressScope
    premisesType?: AddressPremisesType | null
    premisesKind?: AddressPremisesKind | null
    reason: string
    evidence: string[]
    sourceVersionFrom?: string
    sourceVersionTo?: string | null
  }>
}

const text = (value: string | null | undefined) => value?.trim() || null

/** Fingerprint the complete supplied address, excluding release bookkeeping. */
export function addressScopeFingerprint(values: ScopeComponents[]) {
  const components = values.map(value => ({
    locale: value.locale.toLowerCase(),
    ...Object.fromEntries(componentFields.map(field => [field, text(value[field])])),
  }))
  const serialised = [...new Set(components.map(value => JSON.stringify(value)))].sort()
  return buildDeterministicUuidV5(FINGERPRINT_NAMESPACE, JSON.stringify(serialised))
}

function classifyLocale(value: ScopeComponents): {
  scope: AddressScope
  premisesType?: AddressPremisesType | null
  premisesKind?: AddressPremisesKind | null
  rule: string
  evidence: string[]
} {
  const evidence = (...fields: Array<keyof ScopeComponents>) =>
    fields
      .filter(field => text(value[field]))
      .map(field => `${value.locale}.${field}: ${value[field]}`)
  if (text(value.blockRef) || text(value.blockExpression)) {
    const type = text(value.blockType)
    const buildingTypes = [
      'block',
      'building',
      'tower',
      'house',
      'villa',
      'mansion',
      'apartment',
      'quarters',
    ]
    // Supplementary rows may preserve an expression without separate type/ref fields.
    const recognisedExpression =
      /^(?:BLK|BLOCK|BLDG|BUILDING|TWR|TOWER|HSE|HOUSE|VILLA|MANSION)\s+\S|\S+(?:座|幢|棟|號屋)$/i.test(
        value.blockExpression ?? '',
      )
    if ((type && buildingTypes.includes(type)) || (!type && recognisedExpression)) {
      return {
        scope: 'building',
        rule: 'building_block',
        evidence: evidence('blockType', 'blockRef', 'blockExpression'),
      }
    }
    return {
      scope: 'unknown',
      rule: 'ambiguous_block',
      evidence: evidence('blockType', 'blockRef', 'blockExpression'),
    }
  }
  if (text(value.buildingName)) {
    // These labels can name either one building or an entire site/complex.
    const ambiguousFacility =
      /\b(?:AIRPORT|STATION|SCHOOL|COLLEGE|UNIVERSITY|HOSPITAL|CAMPUS|ESTATE|VILLAGE|SHOPPING CENT(?:RE|ER)|OUTLETS|SPORTS GROUND|STADIUM|YARD|DEPOT)\b|機場|机场|車站|车站|鐵站|铁站|學校|学校|小學|小学|中學|中学|大學|大学|醫院|医院|商場|商场|屋邨|屋苑|村|運動場|运动场|貨場|货场/i.test(
        requireDefined(value.buildingName),
      )
    return {
      scope: ambiguousFacility ? 'unknown' : 'building',
      rule: ambiguousFacility ? 'ambiguous_facility_name' : 'building_name',
      evidence: evidence('buildingName'),
    }
  }
  if (text(value.phaseRef) || text(value.phaseName) || text(value.phaseExpression))
    return {
      scope: 'phase',
      rule: 'phase_component',
      evidence: evidence('phaseName', 'phaseRef', 'phaseExpression'),
    }
  if (text(value.premisesName))
    return {
      scope: 'premises',
      rule: 'estate_component',
      evidence: evidence('premisesName'),
    }
  return { scope: 'unknown', rule: 'insufficient_components', evidence: [] }
}

/** Classify corrected canonical components; never infer units or parents from numbers. */
export function establishAddressScope(
  input: {
    addressId: string
    values: ScopeComponents[]
    sourceVersion?: string
    componentCorrections?: Array<{ id: string; revision: number }>
  },
  curation: AddressScopeCuration = fixture as AddressScopeCuration,
): {
  scope: AddressScope
  premisesType: AddressPremisesType | null
  premisesKind: AddressPremisesKind | null
  review: AddressScopeReview
} {
  if (curation.version !== 1 || !Array.isArray(curation.overrides))
    throw new Error('Unsupported Address scope curation fixture.')
  const inputFingerprint = addressScopeFingerprint(input.values)
  const overrides = curation.overrides.filter(
    value => value.addressId === input.addressId,
  )
  if (overrides.length > 1)
    throw new Error(
      `Address scope ${input.addressId} requires review: duplicate overrides.`,
    )
  const override = overrides[0]
  if (override) {
    const fail = (reason: string): never => {
      throw new Error(`Address scope ${input.addressId} requires review: ${reason}`)
    }
    if (
      curation.overrides.some(value => value !== override && value.id === override.id)
    )
      fail('duplicate decision ID')
    const versionPattern = /^\d{4}-\d{2}-\d{2}\.\d+$/
    const compare = (a: string, b: string) => {
      const [ad = '', ar = '0'] = a.split('.')
      const [bd = '', br = '0'] = b.split('.')
      return ad.localeCompare(bd) || Number(ar) - Number(br)
    }
    if (override.sourceVersionFrom || override.sourceVersionTo) {
      if (!input.sourceVersion || !versionPattern.test(input.sourceVersion))
        fail('missing source version')
      for (const bound of [override.sourceVersionFrom, override.sourceVersionTo])
        if (bound && !versionPattern.test(bound)) fail('invalid source version bound')
      if (
        override.sourceVersionFrom &&
        override.sourceVersionTo &&
        compare(override.sourceVersionFrom, override.sourceVersionTo) > 0
      )
        fail('reversed source version bounds')
    }
    const applies =
      (!override.sourceVersionFrom ||
        compare(requireDefined(input.sourceVersion), override.sourceVersionFrom) >=
          0) &&
      (!override.sourceVersionTo ||
        compare(requireDefined(input.sourceVersion), override.sourceVersionTo) <= 0)
    if (applies) {
      if (
        override.premisesKind != null &&
        !addressPremisesKinds.includes(override.premisesKind)
      )
        fail('invalid premises kind')
      if (!addressScopes.includes(override.scope)) fail('invalid scope')
      if (
        override.premisesType != null &&
        !['site', 'complex'].includes(override.premisesType)
      )
        fail('invalid premises type')
      if (
        !override.id?.trim() ||
        !Number.isInteger(override.revision) ||
        override.revision < 1 ||
        !override.reason?.trim() ||
        !Array.isArray(override.evidence) ||
        !override.evidence.length ||
        override.evidence.some(value => typeof value !== 'string' || !value.trim())
      )
        fail('missing curation identity, revision, reason or evidence')
      if (override.inputFingerprint !== inputFingerprint)
        fail('address components changed')
      return {
        scope: override.scope,
        premisesType: override.premisesType ?? null,
        premisesKind: override.premisesKind ?? null,
        review: {
          method: 'curated',
          policyVersion: POLICY_VERSION,
          inputFingerprint,
          rule: 'manual_override',
          evidence: override.evidence,
          reviewReason: null,
          curation: {
            id: override.id,
            revision: override.revision,
            reason: override.reason,
          },
        },
      }
    }
  }
  const assertions = input.values
    .map(classifyLocale)
    .sort((a, b) => a.rule.localeCompare(b.rule))
  const known = assertions.filter(value => value.scope !== 'unknown')
  const ambiguous = assertions.find(
    value =>
      value.rule === 'ambiguous_block' || value.rule === 'ambiguous_facility_name',
  )
  const conflicting = new Set(known.map(value => value.scope)).size > 1
  const chosen = !ambiguous && !conflicting ? known[0] : undefined
  const rule = ambiguous
    ? ambiguous.rule
    : conflicting
      ? 'conflicting_locales'
      : (chosen?.rule ?? 'insufficient_components')
  return {
    scope: chosen?.scope ?? 'unknown',
    premisesType: chosen?.premisesType ?? null,
    premisesKind: null,
    review: {
      method: chosen ? 'heuristic' : 'unknown',
      policyVersion: POLICY_VERSION,
      inputFingerprint,
      rule,
      reviewReason: chosen ? null : rule,
      evidence: [
        ...new Set([
          ...assertions.flatMap(value => value.evidence),
          ...(input.componentCorrections ?? []).map(
            value => `component_correction:${value.id}@${value.revision}`,
          ),
        ]),
      ].sort(),
    },
  }
}
