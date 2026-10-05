export type JsonFieldChange = {
  /** Path segments preserve literal dots and slashes in publisher field names. */
  path: string[]
  beforeExists: boolean
  afterExists: boolean
  before: unknown
  after: unknown
}

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/** Compare JSON values without treating object key order as a content change. */
export function equalJson(left: unknown, right: unknown): boolean {
  if (left === right) return true
  if (Array.isArray(left) && Array.isArray(right))
    return (
      left.length === right.length &&
      left.every((value, i) => equalJson(value, right[i]))
    )
  if (!object(left) || !object(right)) return false
  const keys = Object.keys(left)
  return (
    keys.length === Object.keys(right).length &&
    keys.every(key => Object.hasOwn(right, key) && equalJson(left[key], right[key]))
  )
}

/** Only changed leaves; missing fields remain distinct from explicit nulls. */
export function jsonFieldDiff(before: unknown, after: unknown): JsonFieldChange[] {
  const changes: JsonFieldChange[] = []
  function visit(
    left: unknown,
    right: unknown,
    path: string[],
    beforeExists: boolean,
    afterExists: boolean,
  ) {
    if (beforeExists === afterExists && equalJson(left, right)) return
    // Geometry is one field: expanding coordinates can produce millions of rows.
    if (path[0] !== 'geometry' && object(left) && object(right)) {
      for (const key of [
        ...new Set([...Object.keys(left), ...Object.keys(right)]),
      ].sort())
        visit(
          left[key],
          right[key],
          [...path, key],
          Object.hasOwn(left, key),
          Object.hasOwn(right, key),
        )
      return
    }
    if (
      Array.isArray(left) &&
      Array.isArray(right) &&
      path[0] !== 'geometry' &&
      [...left, ...right].every(object)
    ) {
      for (let i = 0; i < Math.max(left.length, right.length); i++)
        visit(
          left[i],
          right[i],
          [...path, String(i)],
          i < left.length,
          i < right.length,
        )
      return
    }
    changes.push({
      path,
      beforeExists,
      afterExists,
      before: beforeExists ? left : null,
      after: afterExists ? right : null,
    })
  }
  visit(before, after, [], before !== undefined, after !== undefined)
  return changes
}
