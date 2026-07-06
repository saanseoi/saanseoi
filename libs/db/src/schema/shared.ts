import { sql } from 'drizzle-orm'
import { integer, real, text } from 'drizzle-orm/sqlite-core'

export const jsonText = (name: string) => text(name, { mode: 'json' })

export const isoTimestamp = (name: string) => text(name)

export const defaultIsoTimestamp = (name: string) =>
  isoTimestamp(name).default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`)

export const toIsoTimestamp = (value: Date | string = new Date()) =>
  (typeof value === 'string' ? new Date(value) : value).toISOString()

export const primaryUuid = (name: string) =>
  text(name)
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID())

export const timestamps = {
  createdAt: defaultIsoTimestamp('createdAt').notNull(),
  updatedAt: defaultIsoTimestamp('updatedAt')
    .$onUpdate(() => /* @__PURE__ */ toIsoTimestamp())
    .notNull(),
}

export const sourceProvenance = {
  sources: jsonText('sources'),
  rawProperties: jsonText('rawProperties'),
  version: integer('version'),
}

export const geoBbox = {
  geometry: jsonText('geometry'),
  bbox: jsonText('bbox'),
}

export const canonicalDivision = {
  id: text('id').notNull(),
  level: integer('level').notNull(),
  type: text('type').notNull(),
  sourceKeys: jsonText('sourceKeys'),
  wikidata: text('wikidata'),
  hierarchy: jsonText('hierarchy'),
  parentDivisionId: text('parentDivisionId'),
  cartography: jsonText('cartography'),
  sources: jsonText('sources'),
  ...geoBbox,
}

export const canonicalDivisionI18n = {
  divisionId: text('divisionId').notNull(),
  locale: text('locale').notNull(),
  name: text('name'),
  nameVariant: jsonText('nameVariant'),
  nameAlts: text('nameAlts'),
  nameRules: jsonText('nameRules'),
  isLocaleInferred: integer('isLocaleInferred', { mode: 'boolean' }).notNull(),
}

export const canonicalAddress2d = {
  id: text('id').notNull(),
  streetId: text('streetId'),
  hamletId: text('hamletId'),
  microhoodId: text('microhoodId'),
  villageId: text('villageId'),
  neighbourhoodId: text('neighbourhoodId'),
  macrohoodId: text('macrohoodId'),
  townId: text('townId'),
  districtId: text('districtId'),
  areaId: text('areaId'),
  countryId: text('countryId'),
  identifiers: jsonText('identifiers'),
  sources: jsonText('sources'),
  ...geoBbox,
}

export const canonicalAddress2dI18n = {
  addressId: text('addressId').notNull(),
  locale: text('locale').notNull(),
  formattedAddress: text('formattedAddress').notNull(),
  buildingName: text('buildingName'),
  buildingNumberFrom: text('buildingNumberFrom'),
  buildingNumberTo: text('buildingNumberTo'),
  blockType: text('blockType'),
  blockNumber: text('blockNumber'),
  blockTypeBeforeNumber: integer('blockTypeBeforeNumber', { mode: 'boolean' }),
  phaseName: text('phaseName'),
  phaseNumber: text('phaseNumber'),
  estateName: text('estateName'),
  streetNumber: text('streetNumber'),
  streetName: text('streetName'),
}

export const canonicalAddress3dI18n = {
  address3dId: text('address3dId').notNull(),
  locale: text('locale').notNull(),
  formattedAddressPart: text('formattedAddressPart').notNull(),
  accessHint: text('accessHint'),
  unitPortion: text('unitPortion'),
  unitNumber: text('unitNumber'),
  unitType: text('unitType'),
  floorNumber: text('floorNumber'),
  floorType: text('floorType'),
}

export const canonicalPlace = {
  id: text('id').notNull(),
  releaseId: text('releaseId').notNull(),
  addressSnapshotId: text('addressSnapshotId'),
  address2dId: text('address2dId'),
  address3dId: text('address3dId'),
  lng: real('lng').notNull(),
  lat: real('lat').notNull(),
  bbox: jsonText('bbox'),
  operatingStatus: text('operatingStatus'),
  basicCategory: text('basicCategory'),
  taxonomyPrimary: text('taxonomyPrimary'),
  taxonomyHierarchy: jsonText('taxonomyHierarchy'),
  taxonomyAlternates: jsonText('taxonomyAlternates'),
  brandWikidata: text('brandWikidata'),
  websites: jsonText('websites'),
  socials: jsonText('socials'),
  emails: jsonText('emails'),
  phones: jsonText('phones'),
  addresses: jsonText('addresses'),
  confidence: real('confidence'),
  sourceKeys: jsonText('sourceKeys'),
  sources: jsonText('sources'),
  firstSeenMonth: text('firstSeenMonth').notNull(),
  lastSeenMonth: text('lastSeenMonth').notNull(),
}

export const canonicalPlaceI18n = {
  placeId: text('placeId').notNull(),
  locale: text('locale').notNull(),
  name: text('name'),
  nameVariant: jsonText('nameVariant'),
  nameAlts: text('nameAlts'),
  isLocaleInferred: integer('isLocaleInferred', { mode: 'boolean' }).notNull(),
  brandName: text('brandName'),
  brandNameVariant: jsonText('brandNameVariant'),
  brandNameAlts: text('brandNameAlts'),
}

export const canonicalStreet = {
  id: text('id').notNull(),
  yearBuilt: jsonText('yearBuilt'),
  references: jsonText('references'),
  sourceKeys: jsonText('sourceKeys'),
}

export const canonicalStreetI18n = {
  streetId: text('streetId').notNull(),
  locale: text('locale').notNull(),
  name: text('name').notNull(),
  base: text('base'),
  designator: text('designator'),
  directionalPrefix: text('directionalPrefix'),
  directionalSuffix: text('directionalSuffix'),
  normalised: text('normalised'),
}
