import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { Database } from 'bun:sqlite'

import type { ParquetInspection } from '@repo/core'
import { createLocalHarbourDb } from '../../../../../libs/core/src/testing/localDb'
import {
  loadMigrationSql,
  seedFixtureCatalog,
} from '../../../../../libs/core/src/testing/metaFixtures'
import {
  handleFinalizeUploadRequest,
  handleSignUploadRequest,
  type UploadSigningEnv,
} from './uploadSession'

const migrationsDir = resolve(import.meta.dir, '../../../../../libs/db/migrations')
const migrationSql = loadMigrationSql(migrationsDir, ['meta'])
const tempDirs: string[] = []
const sqliteHandles: Database[] = []
const fixtureInspection: ParquetInspection = {
  rowCount: 2050,
  schema: [
    { name: 'id', type: 'string', nullable: false },
    { name: 'theme', type: 'string', nullable: true },
    { name: 'type', type: 'string', nullable: true },
    { name: 'country', type: 'string', nullable: true },
    { name: 'region', type: 'string', nullable: true },
  ],
  distinctThemeValues: ['addresses'],
  distinctTypeValues: ['address'],
  distinctCountryValues: ['hk'],
  distinctRegionValues: ['hk'],
}
const fixtureBytes = new Uint8Array([0x50, 0x41, 0x52, 0x31])
const signingEnv: UploadSigningEnv = {
  R2_ACCOUNT_ID: '1234567890abcdef1234567890abcdef',
  R2_RAW_ACCESS_KEY_ID: 'test-access-key',
  R2_RAW_BUCKET_NAME: 'ss-raw-preview',
  R2_RAW_SECRET_ACCESS_KEY: 'test-secret-key',
}

class FakeR2Bucket {
  objects = new Map<string, ArrayBuffer | Blob | null>()
  metadata = new Map<string, Record<string, string>>()
  getCalls = 0

  async head(key: string) {
    if (!this.objects.has(key)) {
      return null
    }

    return {
      key,
      customMetadata: this.metadata.get(key) ?? {},
    }
  }

  async get(key: string) {
    this.getCalls += 1
    const object = this.objects.get(key)

    if (!this.objects.has(key)) {
      return null
    }

    return {
      async arrayBuffer() {
        if (object instanceof Blob) {
          return object.arrayBuffer()
        }

        return object ?? new ArrayBuffer(0)
      },
    }
  }

  async put(
    key: string,
    value: ArrayBuffer | Blob | null,
    options?: { customMetadata?: Record<string, string> },
  ) {
    this.objects.set(key, value)
    this.metadata.set(key, options?.customMetadata ?? {})
    return { key }
  }
}

afterEach(() => {
  while (sqliteHandles.length > 0) {
    sqliteHandles.pop()?.close()
  }

  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()

    if (dir) {
      rmSync(dir, { recursive: true, force: true })
    }
  }
})

describe('upload session local processing ownership', () => {
  test('finalizeUpload leaves releases staged without queueing work', async () => {
    const { bucket, db } = initHarness('harbour-local-sql-finalize.sqlite')
    const signResult = await handleSignUploadRequest(db, bucket, signingEnv, {
      contentType: 'application/octet-stream',
      fileName: 'overture-hk-address.parquet',
      fileSize: fixtureBytes.byteLength,
      inspection: fixtureInspection,
      plan: {
        shardYear: '2025',
        cohortKey: '2026-05',
        sourceVersion: '2026-05-20.0',
      },
      schemaVersionId: 'overture-address-v2025-09-24.0',
    })

    await putSignedUploadObject(bucket, signResult, fixtureBytes.slice().buffer)

    const result = await handleFinalizeUploadRequest(db, bucket, {
      releaseId: signResult.releaseId,
    })

    expect(result.releaseId).toBe(signResult.releaseId)
    expect(bucket.getCalls).toBe(0)
  })

  test('signed upload metadata preserves schema drift validation for the next release', async () => {
    const { bucket, db } = initHarness('harbour-signed-upload-schema.sqlite')
    const firstSignResult = await handleSignUploadRequest(db, bucket, signingEnv, {
      contentType: 'application/octet-stream',
      fileName: 'overture-hk-address.parquet',
      fileSize: fixtureBytes.byteLength,
      inspection: fixtureInspection,
      plan: {
        shardYear: '2025',
        cohortKey: '2026-05',
        sourceVersion: '2026-05-20.0',
      },
      schemaVersionId: 'overture-address-v2025-09-24.0',
    })

    expect(typeof firstSignResult.uploadHeaders['x-amz-meta-schemaFingerprint']).toBe(
      'string',
    )
    await putSignedUploadObject(
      bucket,
      firstSignResult,
      fixtureBytes.slice().buffer,
      'lowercase',
    )

    await handleFinalizeUploadRequest(db, bucket, {
      releaseId: firstSignResult.releaseId,
    })

    await expect(
      handleSignUploadRequest(db, bucket, signingEnv, {
        contentType: 'application/octet-stream',
        fileName: 'overture-hk-address.parquet',
        fileSize: fixtureBytes.byteLength,
        inspection: fixtureInspection,
        plan: {
          shardYear: '2026',
          cohortKey: '2026-06',
          sourceVersion: '2026-06-17.0',
        },
        schemaVersionId: 'overture-address-v2025-09-24.0',
      }),
    ).resolves.toMatchObject({
      releaseCode: 'dr-hk-overture-address-2026-06-17.0',
      status: 'uploading',
    })
  })

  test('requestUpload stats preserve schema drift validation when object metadata is missing', async () => {
    const { bucket, db } = initHarness('harbour-signed-upload-schema-fallback.sqlite')
    const firstSignResult = await handleSignUploadRequest(db, bucket, signingEnv, {
      contentType: 'application/octet-stream',
      fileName: 'overture-hk-address.parquet',
      fileSize: fixtureBytes.byteLength,
      inspection: fixtureInspection,
      plan: {
        shardYear: '2025',
        cohortKey: '2026-05',
        sourceVersion: '2026-05-20.0',
      },
      schemaVersionId: 'overture-address-v2025-09-24.0',
    })

    await putSignedUploadObject(bucket, firstSignResult, fixtureBytes.slice().buffer)

    await handleFinalizeUploadRequest(db, bucket, {
      releaseId: firstSignResult.releaseId,
    })

    bucket.metadata.set(firstSignResult.rawObjectKey, {})

    await expect(
      handleSignUploadRequest(db, bucket, signingEnv, {
        contentType: 'application/octet-stream',
        fileName: 'overture-hk-address.parquet',
        fileSize: fixtureBytes.byteLength,
        inspection: fixtureInspection,
        plan: {
          shardYear: '2026',
          cohortKey: '2026-06',
          sourceVersion: '2026-06-17.0',
        },
        schemaVersionId: 'overture-address-v2025-09-24.0',
      }),
    ).resolves.toMatchObject({
      releaseCode: 'dr-hk-overture-address-2026-06-17.0',
      status: 'uploading',
    })
  })
})

function initHarness(fileName: string) {
  const dir = mkdtempSync(join(tmpdir(), 'harbour-upload-session-local-sql-'))
  const dbPath = join(dir, fileName)
  const sqlite = new Database(dbPath)
  const bucket = new FakeR2Bucket()

  tempDirs.push(dir)
  sqliteHandles.push(sqlite)
  sqlite.exec(migrationSql.replaceAll('--> statement-breakpoint', ''))
  seedFixtureCatalog(sqlite)

  return {
    bucket,
    db: createLocalHarbourDb(sqlite),
  }
}

function putSignedUploadObject(
  bucket: FakeR2Bucket,
  signResult: { rawObjectKey: string; uploadHeaders: Record<string, string> },
  value: ArrayBuffer,
  keyCase: 'preserve' | 'lowercase' = 'preserve',
) {
  return bucket.put(signResult.rawObjectKey, value, {
    customMetadata: signedUploadCustomMetadata(signResult.uploadHeaders, keyCase),
  })
}

function signedUploadCustomMetadata(
  headers: Record<string, string>,
  keyCase: 'preserve' | 'lowercase',
) {
  const metadata: Record<string, string> = {}

  for (const [header, value] of Object.entries(headers)) {
    const normalizedHeader = header.toLowerCase()

    if (!normalizedHeader.startsWith('x-amz-meta-')) {
      continue
    }

    const metadataKey = header.slice('x-amz-meta-'.length)
    metadata[keyCase === 'lowercase' ? metadataKey.toLowerCase() : metadataKey] = value
  }

  return metadata
}
