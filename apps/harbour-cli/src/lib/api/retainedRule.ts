import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import {
  hashBytes,
  retainObject,
  type ProvenanceStore,
  type RuleDeclaration,
} from '@repo/core/provenance'

/** Freeze the exact implementation source digest alongside the registered declaration. */
export async function retainRegisteredRule(
  store: ProvenanceStore,
  declaration: RuleDeclaration,
) {
  const file = resolve(
    import.meta.dir,
    '../../../../..',
    declaration.implementation.path,
  )
  const revision = await hashBytes(new Uint8Array(await readFile(file)))
  return retainObject(store, {
    ...declaration,
    implementation: { ...declaration.implementation, revision },
  })
}
