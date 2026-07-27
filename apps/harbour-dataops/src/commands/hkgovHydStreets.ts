import { createHash as createNodeHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import { createHash } from '@repo/core/pipeline/utils'

import type {
  ParsedArgs,
  UploadTarget,
} from '../../../harbour-cli/src/lib/cli/options.ts'
import {
  HKGOV_TD_PEDESTRIAN_STREET_LAYERS,
  readHkgovHydStreetArchive,
  readHkgovTdPedestrianStreetArchive,
  type HkgovHydStreetArchiveKind,
} from '../../../harbour-cli/src/lib/sources/hkgov/hkgovHyd.ts'
import {
  processNativeSourceSqlRelease,
  type NativeSourceRow,
} from '../../../harbour-cli/src/lib/localPipeline/nativeSourceSql.ts'

const DATASETS = {
  'ds-hk-hkgov-hyd-street': {
    kind: 'streetNamePlate',
    table: 'hkgovHydStreetNamePlates',
  },
  'ds-hk-hkgov-hyd-sensitive-street': {
    kind: 'sensitiveStreet',
    table: 'hkgovHydSensitiveStreets',
  },
  'ds-hk-hkgov-hyd-strategic-street': {
    kind: 'strategicStreet',
    table: 'hkgovHydStrategicStreets',
  },
} as const

const PEDESTRIAN_DATASET = 'ds-hk-hkgov-hyd-pedestrian-street'

export async function runHkgovHydStreetArchiveIngestCommand(
  args: ParsedArgs,
  target: UploadTarget,
  printUsage: () => void,
) {
  const inputFile = args.positionals[0]
  const datasetCode = args.options['dataset-code']
  const sourceVersion = args.options['source-version']
  const releaseNotesUrl = args.options['release-notes-url']
  const sourceArchiveKey = args.options['source-archive-key']
  const sourceArchiveSha256 = args.options['source-archive-sha256']
  if (
    !inputFile ||
    args.positionals.length !== 1 ||
    typeof datasetCode !== 'string' ||
    (!(datasetCode in DATASETS) && datasetCode !== PEDESTRIAN_DATASET) ||
    typeof sourceVersion !== 'string' ||
    !/^\d{4}-Q[1-4](?:\.\d+)?$/.test(sourceVersion) ||
    typeof releaseNotesUrl !== 'string' ||
    typeof sourceArchiveKey !== 'string' ||
    !isSha256(sourceArchiveSha256)
  ) {
    printUsage()
    throw new Error(
      'HyD street ingestion requires <source.zip>, --dataset-code, --source-version YYYY-QN, --release-notes-url, --source-archive-key, and --source-archive-sha256.',
    )
  }
  const archivePath = resolve(inputFile)
  const archiveBytes = await readFile(archivePath)
  assertArchiveHash(archiveBytes, sourceArchiveSha256)
  const provenance = {
    dataset: 'hkgov-hyd',
    sourceArchiveKey,
    sourceArchiveSha256,
  }

  if (datasetCode === PEDESTRIAN_DATASET) {
    const layers = readHkgovTdPedestrianStreetArchive(archiveBytes)
    const baseRows: NativeSourceRow[] = []
    const i18nRows: NativeSourceRow[] = []
    for (const layer of HKGOV_TD_PEDESTRIAN_STREET_LAYERS) {
      const kind = pedestrianKind(layer)
      for (const feature of layers[layer].features) {
        const objectId = requiredInteger(feature.properties.OBJECTID, 'OBJECTID')
        const sourceRecordId = `TD:PEDESTRIAN:${kind}:${objectId}`
        baseRows.push({
          kind,
          objectId,
          rawProperties: feature.properties,
          regionCode: feature.properties.Region ?? null,
          sourceGeometry: feature.geometry === null ? 'null' : feature.geometry,
          sourceRecordId,
          sources: [{ ...provenance, layerName: layer }],
          startTime: feature.properties.Start_Time ?? null,
          endTime: feature.properties.End_Time ?? null,
        })
        for (const [locale, description] of [
          ['zh-Hant', feature.properties.TC_Description],
          ['zh-Hans', feature.properties.SC_Description],
          ['en', feature.properties.EN_Description],
        ] as const) {
          if (!description) continue
          i18nRows.push({ description, locale, sourceRecordId })
        }
      }
    }
    if (baseRows.length !== 79) {
      throw new Error(
        `TD pedestrian archive must contain 79 features; found ${baseRows.length}.`,
      )
    }
    await processNativeSourceSqlRelease(target, {
      archiveObjectKey: sourceArchiveKey,
      archivePath,
      archiveSha256: sourceArchiveSha256,
      cohortKey: sourceVersion,
      datasetCode,
      releaseNotesUrl,
      rowCount: baseRows.length,
      source: 'hkgov-hyd',
      sourceVersion,
      tables: [
        {
          name: 'hkgovTdPedestrianStreets',
          provenance: 'required',
          replaceCurrentRows: true,
          rows: baseRows,
        },
        {
          name: 'hkgovTdPedestrianStreetI18n',
          provenance: 'inherited',
          replaceCurrentRows: true,
          rows: i18nRows,
        },
      ],
      theme: 'streets',
      type: 'street',
    })
    return
  }

  const profile = DATASETS[datasetCode as keyof typeof DATASETS]
  const collection = await readHkgovHydStreetArchive(
    profile.kind as HkgovHydStreetArchiveKind,
    archiveBytes,
  )
  const rows = await Promise.all(
    collection.features.map(async feature => {
      const properties = feature.properties
      const sourceRecordId = await hydSourceRecordId(profile.kind, feature)
      const common = {
        rawProperties: properties,
        sourceGeometry: feature.geometry,
        sourceRecordId,
        sources: [{ ...provenance, layerName: hydLayer(profile.kind) }],
      }
      if (profile.kind === 'streetNamePlate') {
        return {
          ...common,
          level: requiredInteger(properties.LVL, 'LVL'),
          roadName: optionalText(properties.ROAD_NAME),
          snpId: requiredText(properties.SNP_ID, 'SNP_ID'),
        }
      }
      return {
        ...common,
        level: requiredInteger(properties.LVL, 'LVL'),
        sectionBetween: optionalText(properties.SECT_BTWN),
        streetName: optionalText(properties.ST_ENGNM),
      }
    }),
  )
  await processNativeSourceSqlRelease(target, {
    archiveObjectKey: sourceArchiveKey,
    archivePath,
    archiveSha256: sourceArchiveSha256,
    cohortKey: sourceVersion,
    datasetCode,
    releaseNotesUrl,
    rowCount: rows.length,
    source: 'hkgov-hyd',
    sourceVersion,
    tables: [
      {
        name: profile.table,
        provenance: 'required',
        replaceCurrentRows: true,
        rows,
      },
    ],
    theme: 'streets',
    type: 'street',
  })
}

function pedestrianKind(layer: (typeof HKGOV_TD_PEDESTRIAN_STREET_LAYERS)[number]) {
  return {
    Part_time_Pedestrian_Street: 'partTimePedestrianStreet',
    Hawker_Street: 'hawkerStreet',
    Market_Street: 'marketStreet',
    Traffic_Calming_Street: 'trafficCalmingStreet',
    Full_Time_Pedestrian_Street: 'fullTimePedestrianStreet',
  }[layer]
}

async function hydSourceRecordId(
  kind: HkgovHydStreetArchiveKind,
  feature: { geometry: unknown; properties: Record<string, unknown> },
) {
  if (kind === 'streetNamePlate') {
    return `HYD:SNP:${requiredText(feature.properties.SNP_ID, 'SNP_ID')}`
  }
  // These two publisher schemas do not expose a feature identifier. The
  // fingerprint gives a deterministic release assertion identity instead of
  // inventing a mutable row ordinal.
  return `HYD:${kind}:${await createHash({ geometry: feature.geometry, properties: feature.properties })}`
}

function hydLayer(kind: HkgovHydStreetArchiveKind) {
  return {
    streetNamePlate: 'SNP',
    sensitiveStreet: 'sensitive',
    strategicStreet: 'STRATEGIC',
  }[kind]
}

function assertArchiveHash(bytes: Uint8Array, expected: string) {
  const actual = createNodeHash('sha256').update(bytes).digest('hex')
  if (actual !== expected) {
    throw new Error(
      `Prepared CSDI archive SHA-256 differs from its updater manifest: expected ${expected}, found ${actual}.`,
    )
  }
}

function isSha256(value: string | boolean | undefined): value is string {
  return typeof value === 'string' && /^[a-f0-9]{64}$/i.test(value)
}

function requiredText(value: unknown, field: string) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`Missing ${field}.`)
  return value.trim()
}

function optionalText(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function requiredInteger(value: unknown, field: string) {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new Error(`Invalid ${field}.`)
  }
  return value
}
