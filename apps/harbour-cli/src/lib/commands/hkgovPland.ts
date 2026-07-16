import { mkdir, mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { note, outro } from '@clack/prompts'

import { formatField } from '../display.ts'
import { prepareHkgovPlandTpuParquet } from '../hkgovPland.ts'
import { prepareHkgovPlandNewTownParquet } from '../hkgovPlandNewTown.ts'
import type { ParsedArgs } from '../options.ts'

export async function runHkgovPlandPrepCommand(
  args: ParsedArgs,
  printUsage: () => void,
) {
  const inputFile = args.positionals[0]
  const sourceVersion =
    typeof args.options['source-version'] === 'string'
      ? args.options['source-version']
      : inferSourceVersion(inputFile ?? '')
  const kind = args.options.kind === 'newtown' ? 'newtown' : 'tpu'

  if (!inputFile || !sourceVersion) {
    printUsage()
    throw new Error(
      'Invalid arguments for `prep-hkgov-pland`. Pass a TPU GeoJSON file and --source-version when it cannot be inferred from the filename.',
    )
  }

  const requestedOutputDir =
    typeof args.options['out-dir'] === 'string' ? args.options['out-dir'] : null
  const outputDir = requestedOutputDir
    ? resolve(requestedOutputDir)
    : await mkdtemp(join(tmpdir(), 'harbour-hkgov-pland-'))
  if (requestedOutputDir) await mkdir(outputDir, { recursive: true })
  const sourceFile = resolve(inputFile)
  if (kind === 'newtown') {
    const divisionOutput = join(
      outputDir,
      `hkgov-pland-newtown-hk-${sourceVersion}-division.parquet`,
    )
    const divisionAreaOutput = join(
      outputDir,
      `hkgov-pland-newtown-hk-${sourceVersion}-divisionArea.parquet`,
    )
    const [division, divisionArea] = await Promise.all([
      prepareHkgovPlandNewTownParquet({
        inputFile: sourceFile,
        outputFile: divisionOutput,
        sourceVersion,
        type: 'division',
      }),
      prepareHkgovPlandNewTownParquet({
        inputFile: sourceFile,
        outputFile: divisionAreaOutput,
        sourceVersion,
        type: 'divisionArea',
      }),
    ])
    note(
      [
        formatField('divisionParquet', division.outputFile),
        formatField('divisionAreaParquet', divisionArea.outputFile),
        formatField('sourceFeatures', String(division.sourceFeatureCount)),
        formatField('canonicalDivisions', String(division.sourceFeatureCount)),
      ].join('\n'),
      'PLANNING DEPARTMENT NEW TOWN PREP RESULT',
    )
    outro('Planning Department New Town parquet preparation complete')
    return
  }

  const divisionOutput = join(
    outputDir,
    `hkgov-pland-pu-hk-${sourceVersion}-division.parquet`,
  )
  const divisionAreaOutput = join(
    outputDir,
    `hkgov-pland-pu-hk-${sourceVersion}-divisionArea.parquet`,
  )
  const [division, divisionArea] = await Promise.all([
    prepareHkgovPlandTpuParquet({
      inputFile: sourceFile,
      outputFile: divisionOutput,
      sourceVersion,
      type: 'division',
    }),
    prepareHkgovPlandTpuParquet({
      inputFile: sourceFile,
      outputFile: divisionAreaOutput,
      sourceVersion,
      type: 'divisionArea',
    }),
  ])

  note(
    [
      formatField('divisionParquet', division.outputFile),
      formatField('divisionAreaParquet', divisionArea.outputFile),
      formatField('sourceFeatures', String(division.sourceFeatureCount)),
      formatField('canonicalDivisions', String(division.divisionCount)),
      formatField('repairedSourceFeatures', String(division.invalidSourceFeatureCount)),
    ].join('\n'),
    'PLANNING DEPARTMENT PREP RESULT',
  )
  outro('Planning Department TPU parquet preparation complete')
}

function inferSourceVersion(filePath: string) {
  return filePath.match(/(?:^|[^0-9])(20\d{2})(?:[^0-9]|$)/)?.[1]
}
