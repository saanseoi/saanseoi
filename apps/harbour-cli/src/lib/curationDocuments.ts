export type CurationDocument = { type: string; document: unknown }
const documents = new WeakMap<object, CurationDocument[]>()

/** Keep the documents selected at lookup time with the resolved processor input. */
export function captureCurationDocuments<T extends object>(
  resolved: T,
  selected: CurationDocument[],
): T {
  documents.set(resolved, structuredClone(selected))
  return resolved
}

export function curationDocumentsFor(...resolved: Array<object | null | undefined>) {
  return resolved.flatMap(value => (value ? (documents.get(value) ?? []) : []))
}
