import { retainObject, serialise } from './objects'
import { retainFixturePartitions } from './fixtures'
import type { ProvenanceStore, ObjectRef } from './types'

const escapePointerSegment = (key: string) =>
  key.replaceAll('~', '~0').replaceAll('/', '~1')
function findPointer(value: unknown, target: string, pointer = ''): string | null {
  if (serialise(value) === target) return pointer
  if (!value || typeof value !== 'object') return null
  for (const [key, child] of Object.entries(value)) {
    if (!child || typeof child !== 'object') continue
    const found = findPointer(child, target, `${pointer}/${escapePointerSegment(key)}`)
    if (found !== null) return found
  }
  return null
}

/** Reference the authored decision in its original document; never an expanded audit copy. */
export async function retainCurationReference(
  store: ProvenanceStore,
  decision: unknown,
  documents: readonly unknown[] = [],
): Promise<{ object: ObjectRef; pointer: string }> {
  const target = serialise(decision)
  for (const document of documents) {
    const pointer = findPointer(document, target)
    if (pointer === null) continue
    const arrays = Object.entries(document as object)
      .filter(([, value]) => Array.isArray(value))
      .sort((a, b) => serialise(b[1]).length - serialise(a[1]).length)
    const arrayKey = arrays[0]?.[0]
    if (!arrayKey) return { object: await retainObject(store, document), pointer }
    const parts = await retainFixturePartitions(store, document, arrayKey)
    const prefix = `/${escapePointerSegment(arrayKey)}/`
    if (pointer.startsWith(prefix)) {
      const [indexText, ...rest] = pointer.slice(prefix.length).split('/')
      const index = Number(indexText)
      const part = parts.find(
        p => index >= p.firstOrdinal && index < p.firstOrdinal + p.count,
      )
      if (!part) throw new Error('Curation fixture partition is missing.')
      return {
        object: part.object,
        pointer: `${prefix}${index - part.firstOrdinal}${rest.length ? `/${rest.join('/')}` : ''}`,
      }
    }
    if (!parts[0]) throw new Error('Curation document has no retained partition.')
    return { object: parts[0].object, pointer }
  }
  // Standalone reviewed instructions are content-addressed individually, not in release-specific packs.
  return { object: await retainObject(store, decision), pointer: '' }
}
