import type { CurrentDatabase } from '@repo/db'
import { and, asc, eq } from '@repo/db'
import { currentSchema } from '@repo/db'

const {
  divisions,
  divisionsI18n,
  places,
  placesCells,
  placesDivision,
  placesFts,
  placesFtsMatch,
  placesI18n,
} = currentSchema

type RegionCode = 'hk' | 'mo'

type PlaceLookup = {
  regionCode: RegionCode
  placeId: string
  snapshotId: string
}

type I18nLookup = {
  placeId: string
  snapshotId: string
  locale?: string
}

type H3Lookup = {
  regionCode: RegionCode
  snapshotId: string
  h3Level: number
  h3Cell: string
  limit?: number
}

type FtsLookup = {
  regionCode: RegionCode
  snapshotId: string
  locale?: string
  query: string
  limit?: number
}

export async function getPlaceCurrent(db: CurrentDatabase, lookup: PlaceLookup) {
  return (
    (await db
      .select()
      .from(places)
      .where(
        and(
          eq(places.snapshotId, lookup.snapshotId),
          eq(places.regionCode, lookup.regionCode),
          eq(places.id, lookup.placeId),
        ),
      )
      .limit(1)
      .get()) ?? null
  )
}

export async function listPlaceI18n(db: CurrentDatabase, lookup: I18nLookup) {
  const conditions = [
    eq(placesI18n.snapshotId, lookup.snapshotId),
    eq(placesI18n.placeId, lookup.placeId),
    lookup.locale ? eq(placesI18n.locale, lookup.locale) : undefined,
  ].filter(condition => condition !== undefined)

  return db
    .select()
    .from(placesI18n)
    .where(and(...conditions))
    .orderBy(asc(placesI18n.locale))
    .all()
}

export async function listPlaceDivisions(db: CurrentDatabase, lookup: I18nLookup) {
  return db
    .select({
      divisionId: divisions.id,
      level: divisions.level,
      parentDivisionId: divisions.parentDivisionId,
      locale: divisionsI18n.locale,
      name: divisionsI18n.name,
      localType: divisionsI18n.localType,
    })
    .from(placesDivision)
    .innerJoin(
      divisions,
      and(
        eq(divisions.snapshotId, placesDivision.divisionSnapshotId),
        eq(divisions.id, placesDivision.divisionId),
      ),
    )
    .leftJoin(
      divisionsI18n,
      and(
        eq(divisionsI18n.snapshotId, divisions.snapshotId),
        eq(divisionsI18n.divisionId, divisions.id),
        lookup.locale ? eq(divisionsI18n.locale, lookup.locale) : undefined,
      ),
    )
    .where(
      and(
        eq(placesDivision.placeSnapshotId, lookup.snapshotId),
        eq(placesDivision.placeId, lookup.placeId),
      ),
    )
    .orderBy(asc(divisions.level), asc(divisionsI18n.locale))
    .all()
}

export async function listPlacesByH3Cell(db: CurrentDatabase, lookup: H3Lookup) {
  return db
    .select({
      placeId: places.id,
      releaseId: places.releaseId,
      regionCode: places.regionCode,
      basicCategory: places.basicCategory,
      taxonomyPrimary: places.taxonomyPrimary,
      operatingStatus: places.operatingStatus,
      lat: places.lat,
      lng: places.lng,
      h3Level: placesCells.h3Level,
      h3Cell: placesCells.h3Cell,
    })
    .from(placesCells)
    .innerJoin(
      places,
      and(eq(places.snapshotId, placesCells.snapshotId), eq(places.id, placesCells.id)),
    )
    .where(
      and(
        eq(placesCells.snapshotId, lookup.snapshotId),
        eq(placesCells.regionCode, lookup.regionCode),
        eq(placesCells.h3Level, lookup.h3Level),
        eq(placesCells.h3Cell, lookup.h3Cell),
      ),
    )
    .limit(lookup.limit ?? 50)
    .all()
}

export async function searchPlacesFts(db: CurrentDatabase, lookup: FtsLookup) {
  try {
    return await db
      .select({
        placeId: places.id,
        regionCode: places.regionCode,
        releaseId: places.releaseId,
        locale: placesFts.locale,
        nameText: placesFts.nameText,
        brandText: placesFts.brandText,
      })
      .from(placesFts)
      .innerJoin(
        places,
        and(
          eq(places.snapshotId, placesFts.snapshotId),
          eq(places.id, placesFts.placeId),
        ),
      )
      .where(
        and(
          eq(placesFts.snapshotId, lookup.snapshotId),
          eq(places.regionCode, lookup.regionCode),
          lookup.locale ? eq(placesFts.locale, lookup.locale) : undefined,
          placesFtsMatch(lookup.query),
        ),
      )
      .limit(lookup.limit ?? 20)
      .all()
  } catch (error) {
    if (error instanceof Error && error.message.includes('no such table: placesFts')) {
      throw new Error(
        'FTS index is not initialized. Rebuild placesFts before using search.',
      )
    }

    throw error
  }
}
