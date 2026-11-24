import type { DivisionHierarchies } from '@repo/db'
import { publicDivisionHierarchies } from '../publicDivisionHierarchies'

export const exportLocales = ['en', 'zh-Hant', 'zh-Hans'] as const
export type ExportNames = Record<(typeof exportLocales)[number], string | null>

/** Preserve missing translations as null; the export never synthesises official names. */
export function exportNames(
  rows: Array<{ locale: string; name: string | null }>,
): ExportNames {
  return Object.fromEntries(
    exportLocales.map(locale => [
      locale,
      rows.find(row => row.locale.toLowerCase() === locale.toLowerCase())?.name ?? null,
    ]),
  ) as ExportNames
}

/** Retain evidenced paths and containment while joining labels from the names projection. */
export function exportHierarchies(hierarchies: DivisionHierarchies | null) {
  if (!hierarchies) throw new Error('Missing canonical division hierarchies')
  return Object.fromEntries(
    Object.entries(publicDivisionHierarchies(hierarchies)).map(([group, paths]) => [
      group,
      paths?.map(path =>
        path.map(({ id, fullContainment }) => ({
          id,
          ...(fullContainment !== undefined ? { fullContainment } : {}),
        })),
      ),
    ]),
  )
}

/** Union canonical area bounds; missing bounds remain explicitly unavailable. */
export function mergeBounds(left: number[] | null, right: unknown): number[] | null {
  if (right === null || right === undefined) return left
  if (
    !Array.isArray(right) ||
    right.length !== 4 ||
    !right.every(value => typeof value === 'number' && Number.isFinite(value))
  )
    throw new Error('Invalid canonical area bbox')
  if (!left) return [...right]
  return [
    Math.min(left[0]!, right[0]),
    Math.min(left[1]!, right[1]),
    Math.max(left[2]!, right[2]),
    Math.max(left[3]!, right[3]),
  ]
}
