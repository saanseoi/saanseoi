import type { GeocodingQuery } from '../schema/geocoding'
import {
  createDivisionResolver,
  nameScore,
  pointGeometry,
  type Coordinate,
} from './divisionGeocoding'
import { rankAddress, compareAddresses } from './addressGeocoding'
import {
  loadGeocodingAddresses,
  loadGeocodingDivisions,
  resolveGeocodingRelease,
  type GeocodingDatabases,
  type GeocodingRelease,
} from './geocodingData'
import { PublicationReadUnavailableError } from '../db/publicationState'
import {
  resolveApiReleaseSetAccessAttribution,
  resolveOptionalApiReleaseSetAccessAttribution,
  type AccessAttribution,
} from './accessAnalytics'

const dependencies = {
  loadGeocodingAddresses,
  loadGeocodingDivisions,
  resolveGeocodingRelease,
}
export type GeocodingDependencies = typeof dependencies
const identity = (release: GeocodingRelease) => ({
  apiReleaseSet: release.code,
  domain: release.domainCode,
  cohort: release.cohortKey,
  schemaVersion: release.schemaVersion,
  rulesetVersion: release.rulesetVersion,
  snapshots: release.snapshots,
})
const requestedNames = <T>(values: Record<string, T>, locales: string) =>
  locales === '*'
    ? values
    : Object.fromEntries(
        Object.entries(values).filter(([locale]) =>
          locales.split(',').includes(locale),
        ),
      )

export async function geocode(
  args: GeocodingDatabases & {
    family: 'address' | 'division'
    query: GeocodingQuery
    onResolved?: (attribution: AccessAttribution) => void
    dependencies?: Partial<GeocodingDependencies>
  },
) {
  const deps = { ...dependencies, ...args.dependencies }
  const { query } = args
  const release = await deps.resolveGeocodingRelease(
    args.metaDb,
    args.family,
    query.apiReleaseSet,
  )
  if (!release)
    return {
      status: 503 as const,
      body: {
        error: 'snapshot_not_ready',
        message: 'No compatible published release set is available.',
      },
    }
  if (args.onResolved) {
    const attribution = await resolveOptionalApiReleaseSetAccessAttribution(() =>
      resolveApiReleaseSetAccessAttribution(args.metaDb.$client, release.code),
    )
    if (attribution) args.onResolved(attribution)
  }
  try {
    const reverse = query.lat !== undefined
    const point: Coordinate | null = reverse ? [query.lng!, query.lat!] : null
    const needsDivisions = args.family === 'division' || query.include === 'divisions'
    const needsAddresses = args.family === 'address' || query.address !== undefined
    let divisionRelease: GeocodingRelease | null =
      args.family === 'division' ? release : null
    let addressRelease: GeocodingRelease | null =
      args.family === 'address' ? release : null
    if (needsAddresses && !addressRelease)
      addressRelease = await deps.resolveGeocodingRelease(
        args.metaDb,
        'address',
        undefined,
        release.snapshots
          .filter(
            snapshot =>
              snapshot.snapshotResourceType === 'division' &&
              (snapshot.role === 'primary' || snapshot.role === 'enrichment'),
          )
          .map(snapshot => snapshot.snapshotId),
      )
    if (needsDivisions && !divisionRelease)
      divisionRelease = await deps.resolveGeocodingRelease(
        args.metaDb,
        'division',
        undefined,
        release.snapshots
          .filter(
            snapshot =>
              snapshot.snapshotResourceType === 'division' &&
              snapshot.variant === 'overture',
          )
          .map(snapshot => snapshot.snapshotId),
      )
    if ((needsAddresses && !addressRelease) || (needsDivisions && !divisionRelease))
      return {
        status: 503 as const,
        body: {
          error: 'compatible_release_unavailable',
          message:
            'No published companion release shares the selected division snapshot.',
          apiReleaseSet: release.code,
        },
      }
    const divisions = divisionRelease
      ? await deps.loadGeocodingDivisions(args, divisionRelease)
      : null
    const resolver = divisions
      ? createDivisionResolver(
          divisions.records.map(record => ({
            ...record,
            i18n: requestedNames(record.i18n, query.locales),
          })),
          divisions.areas,
        )
      : null
    const meta = {
      apiVersion: '1',
      direction: reverse ? 'reverse' : 'forward',
      release: identity(release),
      ...(addressRelease ? { addressRelease: identity(addressRelease) } : {}),
      ...(divisionRelease ? { divisionRelease: identity(divisionRelease) } : {}),
      ...(reverse ? { coordinates: point, maxDistance: query.maxDistance } : {}),
    }
    if (args.family === 'division' && point)
      return {
        status: 200 as const,
        body: { data: resolver!.resolve(point, query.geometry === 'stub'), meta },
      }
    if (args.family === 'division' && query.placename !== undefined) {
      const candidates = divisions!.records
        .map(record => ({
          record,
          score: nameScore(
            query.placename!,
            Object.values(record.i18n).flatMap(value => [
              value.name,
              ...(value.nameAlts ?? []),
              ...(value.nameVariant ?? []),
            ]),
          ),
        }))
        .filter(candidate => candidate.score > 0)
        .sort(
          (a, b) =>
            b.score - a.score ||
            a.record.division.id.localeCompare(b.record.division.id),
        )
      return {
        status: 200 as const,
        body: {
          data: candidates.slice(0, query.limit).map(({ record, score }, index) => {
            const coordinate = pointGeometry(record.division.geometry)
            return {
              id: record.division.id,
              type: 'divisions',
              rank: index + 1,
              score,
              category: record.division.category,
              class: record.division.class,
              level: record.division.level,
              names: requestedNames(record.i18n, query.locales),
              // The label point locates a forward candidate; only stub polygons
              // determine containment, and may disagree with this named identity.
              coordinates: coordinate,
              coordinateRole: 'label',
              divisions: resolver!.resolveNamed(
                record.division.id,
                coordinate,
                query.geometry === 'stub',
              ),
            }
          }),
          meta: {
            ...meta,
            resolution:
              candidates.length > 1
                ? 'ambiguous'
                : candidates.length
                  ? 'resolved'
                  : 'not_found',
            total: candidates.length,
            truncated: candidates.length > query.limit,
          },
        },
      }
    }
    const addresses = await deps.loadGeocodingAddresses(args, addressRelease!, query)
    const candidates = addresses.records
      .flatMap(record => {
        const ranked = rankAddress(record, query)
        return ranked ? [ranked] : []
      })
      .sort(compareAddresses)
    return {
      status: 200 as const,
      body: {
        data: candidates
          .slice(0, query.limit)
          .map(({ record, coordinates, distance, score }, index) => {
            const divisions =
              coordinates && resolver
                ? resolver.resolve(coordinates, query.geometry === 'stub')
                : null
            if (args.family === 'division')
              return {
                type: 'divisions',
                rank: index + 1,
                score,
                coordinates,
                addressId: record.address.id,
                divisions,
              }
            return {
              type: 'addresses',
              id: record.address.id,
              rank: index + 1,
              attributes: {
                ...record.address,
                geometry: coordinates ? { type: 'Point', coordinates } : null,
                i18n: requestedNames(record.i18n, query.locales),
              },
              match: point
                ? {
                    type: distance === 0 ? 'exact_location' : 'nearest',
                    distanceMetres: distance,
                  }
                : { type: score === 1 ? 'exact_text' : 'partial_text', score },
              ...(query.include === 'divisions' ? { divisions } : {}),
            }
          }),
        meta: {
          ...meta,
          resolution:
            candidates.length > 1 &&
            (!point || candidates[0]!.distance === candidates[1]!.distance)
              ? 'ambiguous'
              : candidates.length
                ? 'resolved'
                : 'not_found',
          total: addresses.total,
          truncated: addresses.total > query.limit,
        },
      },
    }
  } catch (error) {
    if (!(error instanceof PublicationReadUnavailableError)) throw error
    return {
      status: 503 as const,
      body: { error: 'snapshot_not_ready', message: error.message },
    }
  }
}
