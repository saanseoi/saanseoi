import { spinner } from '@clack/prompts'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { prepareUpload } from '@repo/core/uploadLocal'
import { prepareHkgovCenstatdDistrictUpload } from '../sources/hkgov/hkgovCenstatd.ts'
import { prepareHkgovHadDistrictUpload } from '../sources/hkgov/hkgovHad.ts'
import { prepareLandsdPlaceNameDivisionUpload } from '../sources/landsd/landsdPlaceName.ts'
import { formatSchemaCheck } from '../cli/display.ts'
import type { ParsedArgs } from '../cli/options.ts'
import { checkOvertureUploadAssumptions } from '../upload/overtureAssumptions.ts'
import { validateOvertureSchema } from '../schema/overture.ts'

export async function prepareHkgovHadGeoJsonUpload(
  filePath: string,
  source: string | undefined,
  sourceVersion: string | undefined,
  sourceArchive: { key: string; sha256: string } | undefined,
) {
  if (!isHkgovHadGeoJson(filePath, source)) {
    return null
  }

  const tempDir = await mkdtemp(join(tmpdir(), 'harbour-hkgov-had-'))
  try {
    const prepared = await prepareHkgovHadDistrictUpload(
      filePath,
      tempDir,
      sourceVersion ?? '2022',
      { sourceArchive },
    )
    return {
      ...prepared,
      cleanup: async () => {
        await prepared.cleanup()
        await rm(tempDir, { force: true, recursive: true })
      },
    }
  } catch (error) {
    await rm(tempDir, { force: true, recursive: true })
    throw error
  }
}

export async function prepareHkgovCenstatdGmlUpload(
  filePath: string,
  datasetCode: string | undefined,
  source: string | undefined,
  sourceVersion: string | undefined,
  transform: string | undefined,
  sourceArchive: { key: string; sha256: string } | undefined,
) {
  if (!isHkgovCenstatdDistrictFile(filePath, source)) return null

  const inputSourceVersion = sourceVersion ?? inferCenstatdSourceVersion(filePath)
  if (
    inputSourceVersion !== '2016' &&
    inputSourceVersion !== '2021' &&
    inputSourceVersion !== '2024'
  ) {
    throw new Error(
      'C&SD District Council GML requires --source-version 2016, 2021, or 2024.',
    )
  }
  if (transform) {
    throw new Error(
      'C&SD display geometry is derived during its exact source upload; omit --transform.',
    )
  }
  const tempDir = await mkdtemp(join(tmpdir(), 'harbour-hkgov-censtatd-'))
  try {
    const prepared = await prepareHkgovCenstatdDistrictUpload(
      filePath,
      tempDir,
      inputSourceVersion,
      {
        datasetCode: censtatdDistrictDatasetCode(datasetCode),
        sourceArchive,
      },
    )
    return {
      ...prepared,
      cleanup: async () => {
        await prepared.cleanup()
        await rm(tempDir, { force: true, recursive: true })
      },
    }
  } catch (error) {
    await rm(tempDir, { force: true, recursive: true })
    throw error
  }
}

export function censtatdDistrictDatasetCode(datasetCode: string | undefined) {
  if (
    datasetCode ===
      'ds-hk-hkgov-censtatd-division-statistic-land-area-population-density-district' ||
    datasetCode ===
      'ds-hk-hkgov-censtatd-division-statistic-permanent-living-quarters-district' ||
    datasetCode ===
      'ds-hk-hkgov-censtatd-division-statistic-population-households-district' ||
    datasetCode === 'ds-hk-hkgov-censtatd-division-statistic-subdivided-units-district'
  ) {
    return datasetCode
  }
  if (datasetCode) {
    throw new Error(
      `C&SD District Council GML does not support dataset ${datasetCode}.`,
    )
  }
  return undefined
}

export function sourceArchiveReference(args: ParsedArgs) {
  const key = args.options['source-archive-key']
  const sha256 = args.options['source-archive-sha256']
  if (key === undefined && sha256 === undefined) return undefined
  if (
    typeof key !== 'string' ||
    typeof sha256 !== 'string' ||
    !/^[a-f0-9]{64}$/i.test(sha256)
  ) {
    throw new Error(
      'Source archive provenance requires both --source-archive-key and a SHA-256 --source-archive-sha256.',
    )
  }
  return { key, sha256 }
}

export async function prepareLandsdPlaceNameGeoJsonUpload(
  filePath: string,
  source: string | undefined,
  sourceVersion: string | undefined,
) {
  if (!isLandsdPlaceNameGeoJson(filePath, source)) return null
  if (!sourceVersion) {
    throw new Error('LandsD Place Name GeoJSON requires --source-version.')
  }

  const tempDir = await mkdtemp(join(tmpdir(), 'harbour-hkgov-landsd-'))
  try {
    const prepared = await prepareLandsdPlaceNameDivisionUpload(
      filePath,
      tempDir,
      sourceVersion,
    )
    return {
      ...prepared,
      cleanup: async () => {
        await prepared.cleanup()
        await rm(tempDir, { force: true, recursive: true })
      },
    }
  } catch (error) {
    await rm(tempDir, { force: true, recursive: true })
    throw error
  }
}

function isHkgovHadGeoJson(filePath: string, source: string | undefined) {
  return (
    filePath.toLowerCase().endsWith('.geojson') &&
    (source === 'hkgov-had' || /(^|[._/\\-])hkgov-had([._/\\-]|$)/i.test(filePath))
  )
}

function isHkgovCenstatdDistrictFile(filePath: string, source: string | undefined) {
  const fileName = filePath.toLowerCase()
  return (
    (fileName.endsWith('.gml') || fileName.endsWith('.xml')) &&
    source === 'hkgov-censtatd'
  )
}

function isLandsdPlaceNameGeoJson(filePath: string, source: string | undefined) {
  return (
    filePath.toLowerCase().endsWith('.geojson') &&
    (source === 'hkgov-landsd' ||
      /(^|[._/\\-])hkgov-landsd-division([._/\\-]|$)/i.test(filePath))
  )
}

function inferCenstatdSourceVersion(filePath: string) {
  return filePath.match(/(?:^|[^0-9])(2016|2021|2024)(?:[^0-9]|$)/)?.[1]
}

export async function resolveAssumptionWarnings(
  filePath: string,
  previewResult: Awaited<ReturnType<typeof prepareUpload>>,
) {
  if (previewResult.plan.source !== 'overture') {
    return []
  }

  try {
    return await checkOvertureUploadAssumptions(filePath, previewResult.plan)
  } catch (error) {
    return [
      `Could not run dropped-field assumption checks: ${error instanceof Error ? error.message : String(error)}`,
    ]
  }
}

export function resolveSchemaVersionId(
  previewResult: Awaited<ReturnType<typeof prepareUpload>>,
) {
  const schemaSpinner = spinner()
  schemaSpinner.start('Schema Check')

  if (previewResult.plan.source === 'overture') {
    try {
      const schemaVersionId = validateOvertureSchema(
        previewResult.plan,
        previewResult.inspection,
      ).schema.id
      schemaSpinner.stop(formatSchemaCheck('passed'))
      return schemaVersionId
    } catch (error) {
      schemaSpinner.error(formatSchemaCheck('failed'))
      throw error
    }
  }

  schemaSpinner.stop(formatSchemaCheck('passed'))
  return `${previewResult.plan.source}-${previewResult.plan.type}-unvalidated`
}
