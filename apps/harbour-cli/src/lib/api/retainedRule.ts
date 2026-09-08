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
  return retainObject(store, await freezeRegisteredRule(declaration))
}

export async function freezeRegisteredRule(declaration: RuleDeclaration): Promise<
  RuleDeclaration & {
    implementation: RuleDeclaration['implementation'] & { revision: string }
  }
> {
  const file = resolve(
    import.meta.dir,
    '../../../../..',
    declaration.implementation.path,
  )
  const revision = await hashBytes(new Uint8Array(await readFile(file)))
  return {
    ...declaration,
    ...(declaration.dependencies
      ? {
          dependencies: await Promise.all(
            declaration.dependencies.map(freezeRegisteredRule),
          ),
        }
      : {}),
    implementation: { ...declaration.implementation, revision },
  }
}
