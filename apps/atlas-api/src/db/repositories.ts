import type { Database } from '@repo/db'
import {
  and,
  asc,
  datasets,
  desc,
  divisions,
  divisionsI18n,
  eq,
  newsletterSubscription,
  places,
  placesCells,
  placesDivision,
  placesFts,
  placesFtsMatch,
  placesI18n,
  user,
} from '@repo/db'

type DatasetFilters = {
  regionCode?: string
  snapshotMonth?: string
  theme?: string
  status?: string
  limit?: number
}

type PlaceLookup = {
  regionCode: string
  placeId: string
}

type I18nLookup = {
  placeId: string
  locale?: string
}

type H3Lookup = {
  regionCode: string
  h3Level: number
  h3Cell: string
  limit?: number
}

type FtsLookup = {
  regionCode: string
  locale?: string
  query: string
  limit?: number
}

export async function markNewsletterPending(db: Database, email: string) {
  const updatedAt = new Date()

  await db
    .insert(newsletterSubscription)
    .values({
      email,
      status: 'pending',
      lastError: null,
      subscribedAt: null,
      updatedAt,
    })
    .onConflictDoUpdate({
      target: newsletterSubscription.email,
      set: {
        status: 'pending',
        lastError: null,
        subscribedAt: null,
        updatedAt,
      },
    })

  await syncUserSubstackStatus(db, email, 'pending')
}

export async function markNewsletterSubscribed(db: Database, email: string) {
  const updatedAt = new Date()

  await db
    .insert(newsletterSubscription)
    .values({
      email,
      status: 'subscribed',
      lastError: null,
      subscribedAt: updatedAt,
      updatedAt,
    })
    .onConflictDoUpdate({
      target: newsletterSubscription.email,
      set: {
        status: 'subscribed',
        lastError: null,
        subscribedAt: updatedAt,
        updatedAt,
      },
    })

  await syncUserSubstackStatus(db, email, 'subscribed')
}

export async function markNewsletterFailed(
  db: Database,
  email: string,
  lastError: string,
) {
  const updatedAt = new Date()

  await db
    .insert(newsletterSubscription)
    .values({
      email,
      status: 'pending',
      lastError,
      subscribedAt: null,
      updatedAt,
    })
    .onConflictDoUpdate({
      target: newsletterSubscription.email,
      set: {
        status: 'pending',
        lastError,
        updatedAt,
      },
    })

  await syncUserSubstackStatus(db, email, 'pending')
}

async function syncUserSubstackStatus(
  db: Database,
  email: string,
  status: 'pending' | 'subscribed' | 'unsubscribed',
) {
  await db
    .update(user)
    .set({ substack: status, updatedAt: new Date() })
    .where(eq(user.email, email))
}

export async function listDatasets(db: Database, filters: DatasetFilters = {}) {
  const conditions = [
    filters.regionCode ? eq(datasets.regionCode, filters.regionCode) : undefined,
    filters.snapshotMonth
      ? eq(datasets.snapshotMonth, filters.snapshotMonth)
      : undefined,
    filters.theme ? eq(datasets.theme, filters.theme) : undefined,
    filters.status ? eq(datasets.status, filters.status) : undefined,
  ].filter(condition => condition !== undefined)

  return db
    .select()
    .from(datasets)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(datasets.snapshotMonth), desc(datasets.ingestedAt))
    .limit(filters.limit ?? 100)
    .all()
}

export async function getPlaceCurrent(db: Database, lookup: PlaceLookup) {
  return (
    (await db
      .select()
      .from(places)
      .where(
        and(eq(places.regionCode, lookup.regionCode), eq(places.id, lookup.placeId)),
      )
      .limit(1)
      .get()) ?? null
  )
}

export async function listPlaceI18n(db: Database, lookup: I18nLookup) {
  const conditions = [
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

export async function listPlaceDivisions(db: Database, lookup: I18nLookup) {
  return db
    .select({
      divisionId: divisions.id,
      level: divisions.level,
      parentDivisionId: divisions.parentDivisionId,
      locale: divisionsI18n.locale,
      otName: divisionsI18n.otName,
      otLocalType: divisionsI18n.otLocalType,
    })
    .from(placesDivision)
    .innerJoin(divisions, eq(divisions.id, placesDivision.divisionId))
    .leftJoin(
      divisionsI18n,
      and(
        eq(divisionsI18n.divisionId, divisions.id),
        lookup.locale ? eq(divisionsI18n.locale, lookup.locale) : undefined,
      ),
    )
    .where(eq(placesDivision.placeId, lookup.placeId))
    .orderBy(asc(divisions.level), asc(divisionsI18n.locale))
    .all()
}

export async function listPlacesByH3Cell(db: Database, lookup: H3Lookup) {
  return db
    .select({
      placeId: places.id,
      datasetId: datasets.datasetId,
      regionCode: places.regionCode,
      otVersion: places.otVersion,
      otVersionHash: places.otVersionHash,
      otBasicCategory: places.otBasicCategory,
      otTaxonomyPrimary: places.otTaxonomyPrimary,
      otOperatingStatus: places.otOperatingStatus,
      otLat: places.otLat,
      otLng: places.otLng,
      h3Level: placesCells.h3Level,
      h3Cell: placesCells.h3Cell,
    })
    .from(placesCells)
    .innerJoin(places, eq(places.id, placesCells.id))
    .innerJoin(datasets, eq(datasets.id, places.datasetRecordId))
    .where(
      and(
        eq(placesCells.regionCode, lookup.regionCode),
        eq(placesCells.h3Level, lookup.h3Level),
        eq(placesCells.h3Cell, lookup.h3Cell),
      ),
    )
    .limit(lookup.limit ?? 50)
    .all()
}

export async function searchPlacesFts(db: Database, lookup: FtsLookup) {
  try {
    return await db
      .select({
        placeId: places.id,
        regionCode: places.regionCode,
        datasetId: datasets.datasetId,
        locale: placesFts.locale,
        nameText: placesFts.nameText,
        brandText: placesFts.brandText,
      })
      .from(placesFts)
      .innerJoin(places, eq(places.id, placesFts.placeId))
      .innerJoin(datasets, eq(datasets.id, places.datasetRecordId))
      .where(
        and(
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
