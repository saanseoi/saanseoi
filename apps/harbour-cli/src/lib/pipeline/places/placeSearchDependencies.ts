import type { HarbourReadableDb } from '@repo/core/db/types'
import { createHash } from '@repo/core/pipeline/utils'
import { currentSchema, and, eq, sql } from '@repo/db'
import type { buildSupplementaryAddressRows } from './supplementaryPlaceAddressRows.ts'

type SearchText = NonNullable<
  typeof currentSchema.placesI18n.$inferSelect.searchDependencyText
>
type SupplementaryRows = Awaited<ReturnType<typeof buildSupplementaryAddressRows>>
type Address = typeof currentSchema.address2d.$inferSelect
type AddressLocale = Pick<
  typeof currentSchema.address2dI18n.$inferSelect,
  'locale' | 'formattedAddress' | 'streetName'
>
type Collection = typeof currentSchema.address3d.$inferSelect
type CollectionLocale = typeof currentSchema.address3dI18n.$inferSelect

/** Resolve once locally; both fresh and incremental FTS consume these retained texts. */
export function createPlaceSearchDependencies(
  db: HarbourReadableDb,
  supplementary?: { snapshotId: string; addresses: SupplementaryRows },
) {
  const supplementaryById = new Map(
    supplementary?.addresses.map(row => [row.current.id, row]),
  )
  const cache = new Map<string, Promise<Awaited<ReturnType<typeof readAddress>>>>()
  const readAddress = async (
    snapshotId: string,
    addressId: string,
    collectionId?: string | null,
  ): Promise<{
    base: Address | SupplementaryRows[number]['current']
    locales: AddressLocale[]
    collection: Collection | undefined
    collectionLocales: CollectionLocale[]
  }> => {
    const extra =
      snapshotId === supplementary?.snapshotId
        ? supplementaryById.get(addressId)
        : undefined
    if (extra)
      return {
        base: extra.current,
        locales: extra.i18n,
        collection: undefined,
        collectionLocales: [],
      }
    const scope = await db
      .select({ id: currentSchema.addressPublicationState.scopeId })
      .from(currentSchema.addressPublicationState)
      .where(
        and(
          eq(currentSchema.addressPublicationState.snapshotId, snapshotId),
          sql`${currentSchema.addressPublicationState.preparedAt} is not null`,
        ),
      )
      .get()
    if (!scope) throw new Error(`Missing exact Place Address dependency ${snapshotId}.`)
    const [base, locales, collection, collectionLocales] = await Promise.all([
      db
        .select()
        .from(currentSchema.address2d)
        .where(
          and(
            eq(currentSchema.address2d.snapshotId, scope.id),
            eq(currentSchema.address2d.id, addressId),
          ),
        )
        .get(),
      db
        .select()
        .from(currentSchema.address2dI18n)
        .where(
          and(
            eq(currentSchema.address2dI18n.snapshotId, scope.id),
            eq(currentSchema.address2dI18n.addressId, addressId),
          ),
        )
        .all(),
      collectionId
        ? db
            .select()
            .from(currentSchema.address3d)
            .where(
              and(
                eq(currentSchema.address3d.snapshotId, scope.id),
                eq(currentSchema.address3d.id, collectionId),
              ),
            )
            .get()
        : undefined,
      collectionId
        ? db
            .select()
            .from(currentSchema.address3dI18n)
            .where(
              and(
                eq(currentSchema.address3dI18n.snapshotId, scope.id),
                eq(currentSchema.address3dI18n.address3dId, collectionId),
              ),
            )
            .all()
        : [],
    ])
    if (!base || (collectionId && !collection))
      throw new Error(
        `Missing Place Address content ${snapshotId}/${addressId}/${collectionId ?? ''}.`,
      )
    return {
      base: base as Address,
      locales: locales as AddressLocale[],
      collection: collection as Collection | undefined,
      collectionLocales: collectionLocales as CollectionLocale[],
    }
  }
  return async (input: {
    addressSnapshotId: string
    addressId: string | null
    address3dId?: string | null
    address3dUnitId?: string | null
    divisionSnapshotId: string
    divisionIds: string[]
    locales: string[]
  }): Promise<{
    addressDependencyHash: string | null
    searchDependencies: Record<string, SearchText>
  }> => {
    const key = JSON.stringify([
      input.addressSnapshotId,
      input.addressId,
      input.address3dId,
    ])
    let address: Awaited<ReturnType<typeof readAddress>> | undefined
    if (input.addressId) {
      let promise = cache.get(key)
      if (!promise) {
        promise = readAddress(
          input.addressSnapshotId,
          input.addressId,
          input.address3dId,
        )
        cache.set(key, promise)
        if (cache.size > 128) cache.delete(cache.keys().next().value!)
      }
      address = await promise
    }
    const selectedUnit = address?.collection?.units.find(
      unit => unit.id === input.address3dUnitId,
    )
    if (input.address3dUnitId && !selectedUnit)
      throw new Error(`Missing exact Place Address unit ${input.address3dUnitId}.`)
    const base = address?.base as unknown as Record<string, unknown> | undefined
    const stableBase = base
      ? Object.fromEntries(
          Object.entries(base).filter(
            ([name]) =>
              ![
                'snapshotId',
                'divisionSnapshotId',
                'streetSnapshotId',
                'createdAt',
                'updatedAt',
                'sources',
              ].includes(name),
          ),
        )
      : null
    const addressDependencyHash = base
      ? await createHash({
          base: stableBase,
          ownerId: address?.collection?.address2dId ?? null,
          unit: selectedUnit ?? null,
          locales: address?.locales
            .map(row =>
              Object.fromEntries(
                Object.entries(row).filter(
                  ([name]) => !['snapshotId', 'createdAt', 'updatedAt'].includes(name),
                ),
              ),
            )
            .sort((a, b) => String(a.locale).localeCompare(String(b.locale))),
          unitLocales: address?.collectionLocales
            .map(row => ({
              locale: row.locale,
              unit: row.units[input.address3dUnitId ?? ''] ?? null,
            }))
            .sort((a, b) => a.locale.localeCompare(b.locale)),
        })
      : null
    const scope = input.divisionIds.length
      ? await db
          .select({ id: currentSchema.divisionPublicationState.scopeId })
          .from(currentSchema.divisionPublicationState)
          .where(
            and(
              eq(
                currentSchema.divisionPublicationState.snapshotId,
                input.divisionSnapshotId,
              ),
              sql`${currentSchema.divisionPublicationState.preparedAt} is not null`,
            ),
          )
          .get()
      : undefined
    if (input.divisionIds.length && !scope)
      throw new Error(
        `Missing exact Place Division dependency ${input.divisionSnapshotId}.`,
      )
    const searchDependencies: Record<string, SearchText> = {}
    for (const locale of input.locales) {
      const translated = address?.locales.find(
        row => row.locale.toLowerCase() === locale.toLowerCase(),
      )
      const unit = address?.collectionLocales.find(
        row => row.locale.toLowerCase() === locale.toLowerCase(),
      )?.units[input.address3dUnitId ?? '']
      const unitText =
        unit?.formattedAddressPart ??
        (locale.toLowerCase() === 'zh-hant'
          ? `${unit?.floorExpression ?? ''}${unit?.unitExpression ?? ''}`
          : `${unit?.unitExpression ?? ''} ${unit?.floorExpression ?? ''}`)
      const names = scope
        ? await db
            .select({ name: currentSchema.divisionsI18n.name })
            .from(currentSchema.divisionsI18n)
            .where(
              and(
                eq(currentSchema.divisionsI18n.snapshotId, scope.id),
                sql`lower(${currentSchema.divisionsI18n.locale}) = ${locale.toLowerCase()}`,
                sql`${currentSchema.divisionsI18n.divisionId} in (select value from json_each(${JSON.stringify(input.divisionIds)}))`,
              ),
            )
            .all()
        : []
      searchDependencies[locale] = {
        addressSnapshotId: input.addressId ? input.addressSnapshotId : null,
        addressText: `${translated?.formattedAddress ?? ''} ${unitText}`.trim(),
        divisionText: [
          ...new Set(names.map(row => String(row.name ?? '')).filter(Boolean)),
        ]
          .sort()
          .join(','),
        streetText: translated?.streetName ?? '',
      }
    }
    return { addressDependencyHash, searchDependencies }
  }
}
