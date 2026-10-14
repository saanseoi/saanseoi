import { resolve } from 'node:path'
import { buildDisplayName } from '@repo/core/displayName'
import { parseWkbGeometry } from '@repo/core/pipeline/services/divisions/division'
import pins from '../../../../../../fixtures/meta/datasetInputs/native-division-administrative-hierarchy.json'
import {
  readReviewSource,
  type ReviewArchiveOptions,
} from '../curatedDivisions/reviewSourceArchives'
import {
  createNativeAdministrativeHierarchy,
  type AdministrativeReference,
} from './nativeAdministrativeHierarchy'

export const nativeAdministrativeHierarchyPins = pins
/** Read immutable archive bytes, independent of CURRENT and of publication order. */
export async function loadNativeAdministrativeHierarchy(
  options: Partial<ReviewArchiveOptions> = {},
) {
  const root = options.root ?? resolve(import.meta.dir, '../../../../../..')
  const records: Record<string, any>[] = []
  for (const pin of pins.sourceReleases) {
    records.push(
      ...(await readReviewSource(pin, {
        root,
        apiBaseUrl: process.env.SAANSEOI_REVIEW_API_URL,
        archiveBaseUrl: process.env.SAANSEOI_REVIEW_ARCHIVE_URL,
        ...options,
      })),
    )
  }
  const references: AdministrativeReference[] = pins.references.map(row => ({
    id: row.id,
    class: row.class,
    name: buildDisplayName(row.names),
    hierarchies: row.hierarchies,
    areas: records
      .filter(area => {
        if (!(area.is_territorial === true || area.is_territorial === 1)) return false
        if (row.class !== 'area') return area.division_id === row.id
        return pins.references.some(
          district =>
            district.class === 'district' &&
            district.id === area.division_id &&
            district.hierarchies.full.some(path =>
              path.some(parent => parent.id === row.id),
            ),
        )
      })
      .map(
        area =>
          parseWkbGeometry(area.geometry) as AdministrativeReference['areas'][number],
      ),
  }))
  if (
    references.filter(row => row.class === 'district').length !== 18 ||
    references.filter(row => row.class === 'area').length !== 3 ||
    references.filter(row => row.class === 'sar').length !== 1
  )
    throw Error(
      'Administrative inference requires 18 Districts, three Areas and HKSAR.',
    )
  return createNativeAdministrativeHierarchy(references)
}
