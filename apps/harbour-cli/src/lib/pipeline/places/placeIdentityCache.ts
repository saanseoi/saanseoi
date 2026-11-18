import { readFile, open, rename, rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import {
  deliveryFileSha256,
  sha256,
  writeDeliveryFile,
  withDeliveryLock,
} from '../local/sqlDeliveryFiles'
import { readStagedJsonLines } from './processLocalPlaceSqlUploadPreparation'
import type { stagePlaceIdentities } from './placeIdentityPreparation'

type Prepared = Awaited<ReturnType<typeof stagePlaceIdentities>>
type Manifest = {
  version: 2
  identity: string
  path: string
  fileSha256: string
  assignmentsPath: string
  assignmentsSha256: string
  ledger: Prepared['ledger']
  checksum: string
}

/** Reuse exact identity evidence; no SQL delivery or publication state is cached. */
export async function reusePlaceIdentityPreparation(input: {
  sourcePath: string
  scope: string
  sourceVersion: string
  predecessorSnapshotId: string | null
  computationContract: string
  releaseRoot: string
  generate: () => Promise<Prepared>
}) {
  return withDeliveryLock(
    resolve(input.releaseRoot, 'identity-preparation-lock'),
    async () => {
      const identity = sha256(
        JSON.stringify({
          cacheVersion: 2,
          sourceSha256: await deliveryFileSha256(input.sourcePath),
          scope: input.scope,
          sourceVersion: input.sourceVersion,
          predecessorSnapshotId: input.predecessorSnapshotId,
          computationContract: input.computationContract,
        }),
      )
      const manifestPath = resolve(input.releaseRoot, 'identity-preparation.json')
      let manifest: Manifest | undefined
      try {
        manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      }
      if (manifest?.identity === identity) {
        const { checksum, ...payload } = manifest
        if (
          manifest.version !== 2 ||
          sha256(JSON.stringify(payload)) !== checksum ||
          (await deliveryFileSha256(manifest.path)) !== manifest.fileSha256 ||
          (await deliveryFileSha256(manifest.assignmentsPath)) !==
            manifest.assignmentsSha256 ||
          (await deliveryFileSha256(manifest.ledger.path)) !== manifest.ledger.hash
        )
          throw new Error('Retained Place identity preparation checksum differs.')
        const bySourceId = new Map<string, { id: string }>()
        for await (const decision of readStagedJsonLines<{
          sourceId: string
          id: string
        }>(manifest.assignmentsPath)) {
          if (
            !decision ||
            typeof decision.id !== 'string' ||
            !decision.id ||
            typeof decision.sourceId !== 'string' ||
            !decision.sourceId ||
            bySourceId.has(decision.sourceId)
          )
            throw new Error('Invalid retained Place identity assignment.')
          bySourceId.set(decision.sourceId, { id: decision.id })
          if (bySourceId.size % 1_000 === 0) Bun.gc(true)
        }
        if (bySourceId.size !== manifest.ledger.records)
          throw new Error('Retained Place identity count differs.')
        console.log(
          `Place identity: reused ${bySourceId.size} checksum-verified assignments.`,
        )
        return { path: manifest.path, ledger: manifest.ledger, bySourceId }
      }
      const prepared = await input.generate()
      const assignmentsPath = resolve(input.releaseRoot, 'identity-assignments.jsonl')
      const temporary = `${assignmentsPath}.${crypto.randomUUID()}.tmp`
      const output = await open(temporary, 'wx')
      try {
        try {
          for (const [sourceId, decision] of prepared.bySourceId)
            await output.writeFile(`${JSON.stringify({ sourceId, id: decision.id })}\n`)
          await output.sync()
        } finally {
          await output.close()
        }
        await rename(temporary, assignmentsPath)
      } finally {
        await rm(temporary, { force: true })
      }
      const payload = {
        version: 2 as const,
        identity,
        path: prepared.path,
        fileSha256: await deliveryFileSha256(prepared.path),
        assignmentsPath,
        assignmentsSha256: await deliveryFileSha256(assignmentsPath),
        ledger: prepared.ledger,
      }
      if ((await deliveryFileSha256(prepared.ledger.path)) !== prepared.ledger.hash)
        throw new Error('Prepared Place identity ledger checksum differs.')
      await writeDeliveryFile(
        input.releaseRoot,
        'identity-preparation.json',
        JSON.stringify({ ...payload, checksum: sha256(JSON.stringify(payload)) }),
      )
      const bySourceId = new Map(
        [...prepared.bySourceId].map(([sourceId, decision]) => [
          sourceId,
          { id: decision.id },
        ]),
      )
      prepared.bySourceId.clear()
      return { ...prepared, bySourceId }
    },
  )
}
