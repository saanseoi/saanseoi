// VALIDATION
import { z } from 'zod'

// SaanSeoi content contract: libs/db/src/schema/shared.ts and libs/db/src/address3d.ts.
// Publication IDs, source attribution and HYPE ownership are deliberately outside authored content.
export const ADDRESS_GRANULARITIES = [
  'unknown',
  'site',
  'complex',
  'phase',
  'building',
  'section',
  'floor',
  'unit',
  'unit_portion',
] as const
// Source block descriptors, not a guarantee of building-level scope: some source
// block components identify flats or units. Preserve the descriptor and expression.
export const ADDRESS_BLOCK_TYPES = [
  'block',
  'building',
  'tower',
  'house',
  'villa',
  'mansion',
  'apartment',
  'flat',
  'unit',
  'quarters',
  'phase',
  'stage',
  'commercial',
  'retail',
  'parking',
  'garage',
  'other',
] as const
export const ADDRESS_UNIT_TYPES = [
  'F', // Flat or apartment.
  'R', // Room.
  'S', // Shop.
  'SU', // Suite.
  'U', // Unit.
  'ST', // Stall.
  'K', // Kiosk.
  'O', // Office.
  'X', // Other or unclassified unit type.
] as const
export const ADDRESS_FLOOR_TYPES = [
  'F', // Floor.
  'G', // Ground floor.
  'UG', // Upper ground floor.
  'LG', // Lower ground floor.
  'B', // Basement.
  'M', // Mezzanine.
  'C', // Concourse.
  'P', // Podium.
  'R', // Roof.
  'X', // Other or unclassified floor type.
] as const
const optionalText = z.string().max(4000).nullable().optional()

/** SaanSeoi address2dI18n content, without database keys or publisher metadata. */
export const LocalAddressI18nSchema = z.strictObject({
  formattedAddress: z.string().max(4000),
  buildingName: optionalText,
  buildingNumberExpression: optionalText,
  buildingNumberFrom: optionalText,
  buildingNumberTo: optionalText,
  buildingNumberConnector: optionalText,
  blockExpression: optionalText,
  blockType: z.enum(ADDRESS_BLOCK_TYPES).nullable().optional(),
  blockRef: optionalText,
  blockTypeBeforeNumber: z.boolean().nullable().optional(),
  phaseExpression: optionalText,
  phaseName: optionalText,
  phaseRef: optionalText,
  premisesName: optionalText,
  streetName: optionalText,
})
/** SaanSeoi Address3dUnit content; identity is assigned only by an actual unit inventory. */
export const LocalAddressUnitSchema = z.strictObject({
  unitRef: z.string().max(4000),
  unitType: z.enum(ADDRESS_UNIT_TYPES),
  floorRef: z.string().max(4000),
  floorType: z.enum(ADDRESS_FLOOR_TYPES),
  unitPortion: z.string().max(4000).nullable(),
})
/** SaanSeoi Address3dUnitI18n content, including its optional source-expression override. */
export const LocalAddressUnitI18nSchema = z.strictObject({
  unitExpression: z.string().max(4000),
  floorExpression: z.string().max(4000),
  formattedAddressPart: z.string().max(4000).optional(),
})
/** Locally authored canonical content, distinct from retained publication evidence. */
export const AddressContentSchema = z
  .strictObject({
    granularity: z.enum(ADDRESS_GRANULARITIES),
    geometry: z
      .strictObject({
        type: z.literal('Point'),
        coordinates: z.union([
          z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]),
          z.tuple([
            z.number().min(-180).max(180),
            z.number().min(-90).max(90),
            z.number(),
          ]),
        ]),
      })
      .nullable()
      .optional(),
    parentAddressId: optionalText,
    streetId: optionalText,
    hamletId: optionalText,
    microhoodId: optionalText,
    villageId: optionalText,
    neighbourhoodId: optionalText,
    ruralAreaId: optionalText,
    macrohoodId: optionalText,
    townId: optionalText,
    islandId: optionalText,
    districtId: optionalText,
    areaId: optionalText,
    countryId: optionalText,
    identifiers: z
      .record(
        z.string().regex(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/),
        z.record(
          z.string().regex(/^[a-z][a-zA-Z0-9]*$/),
          z.union([z.string(), z.number(), z.array(z.union([z.string(), z.number()]))]),
        ),
      )
      .nullable()
      .optional(),
    i18n: z.record(z.string().min(1), LocalAddressI18nSchema),
    unit: LocalAddressUnitSchema.nullable(),
    unitI18n: z.record(z.string().min(1), LocalAddressUnitI18nSchema),
  })
  .superRefine((value, ctx) => {
    if (!value.unit && Object.keys(value.unitI18n).length)
      ctx.addIssue({
        code: 'custom',
        path: ['unitI18n'],
        message: 'Unit translations require unit content',
      })
  })
export type AddressContent = z.infer<typeof AddressContentSchema>

/**
 * Preserve existing display-only data as authored SaanSeoi address content.
 * @param labels Existing locale labels, never interpreted as verified components.
 * @returns An explicit local address without invented building, unit or source identities.
 */
export function createAddressContent(
  labels: Record<string, string> = {},
): AddressContent {
  return {
    granularity: 'unknown',
    i18n: Object.fromEntries(
      Object.entries(labels).map(([locale, formattedAddress]) => [
        locale,
        { formattedAddress },
      ]),
    ),
    unit: null,
    unitI18n: {},
  }
}
