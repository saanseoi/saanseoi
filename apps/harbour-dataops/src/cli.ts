import { cancel } from '@clack/prompts'
import { resolve } from 'node:path'

import {
  parseArgs,
  resolveUploadTarget,
  type ParsedArgs,
} from '../../harbour-cli/src/lib/cli/options.ts'

function printUsage() {
  console.log(`  Usage:
  bun run dataops -- hkgov-dpo:prepare <source-dir> [--target local|preview|production] --cohort-key DIVISION_COHORT [--source-version YYYY-MM-DD.NN] [--identity-history FILE] [--identity-decisions FILE] [--identity-drift-report FILE] [--db /path/to/local.sqlite]
  bun run dataops -- hkgov-dpo:ingest <ALS-source-root> --target local|preview|production --cohort-key START_COHORT [--from-source-version YYYY-MM-DD.NNNN] [--identity-history FILE] [--identity-decisions FILE] [--release-notes-url URL] [--dry-run] [--yes]
  bun run dataops -- hkgov-dpo:backfill-local <ALS-source-root> --target local --cohort-key START_COHORT [--from-source-version YYYY-MM-DD.NNNN] [--identity-history FILE] [--identity-decisions FILE] [--release-notes-url URL] [--dry-run] [--yes]
  bun run dataops -- hkgov-pland:prepare <GeoJSON> [--kind tpu|new-town] [--source-version YYYY] [--out-dir PATH]
  bun run dataops -- hkgov-pland:backfill --kind pu|new-town --target local|preview|production [--continue]
  bun run dataops -- hkgov-pland:ingest --kind pu|new-town <source.zip> --target local|preview|production --source-version YYYY --release-notes-url URL
  bun run dataops -- hkgov-censtatd:district-land-area-population-density --target local --source-version 2022|2024
  bun run dataops -- hkgov-landsd-streets:baseline --target local|preview|production [--staging-dir PATH] [--out-dir PATH]
  bun run dataops -- hkgov-landsd-streets:landsd-notices --target local|preview|production [--staging-dir PATH] [--out-dir PATH]
  bun run dataops -- hkgov-landsd-streets:official-egazette --target local|preview|production [--staging-dir PATH] [--out-dir PATH]
  bun run dataops -- hkgov-landsd-streets:assemble --target local|preview|production [--staging-dir PATH] [--out-dir PATH]
  bun run dataops -- hkgov-hkgro-street-names:retrieve --target local [--year YYYY[,YYYY...]] [--out-dir PATH]
  bun run dataops -- hkgov-hkgro-street-names:ocr --target local [--year YYYY[,YYYY...]] [--hkgro-pdf-id ID[,ID...]] [--out-dir PATH]
  bun run dataops -- hkgov-hkgro-street-names:discover --target local [--out-dir PATH] [--review-file PATH]
  bun run dataops -- hkgov-hkgro-street-names:review --target local [--out-dir PATH] [--review-file PATH] [--all]
`)
}

function withoutOption(args: ParsedArgs, option: string): ParsedArgs {
  const { [option]: _ignored, ...options } = args.options
  return { ...args, options }
}

async function main() {
  const invocationCwd =
    process.env.SAANSEOI_INVOCATION_CWD ??
    process.env.INIT_CWD ??
    resolve(import.meta.dir, '../../..')
  process.chdir(invocationCwd)
  const args = parseArgs(process.argv)
  const target = resolveUploadTarget(args)

  if (!args.command || args.command === '--help' || args.options.help) {
    printUsage()
    return
  }

  switch (args.command) {
    case 'hkgov-dpo:prepare': {
      const { runHkgovAlsPrepCommand } = await import('./commands/hkgovAls.ts')
      await runHkgovAlsPrepCommand(args, target, printUsage)
      return
    }
    case 'hkgov-dpo:backfill-local': {
      const { runHkgovAlsLocalIngestCommand } = await import('./commands/hkgovAls.ts')
      await runHkgovAlsLocalIngestCommand(args, target, printUsage)
      return
    }
    case 'hkgov-dpo:ingest': {
      const { runHkgovAlsIngestCommand } = await import('./commands/hkgovAls.ts')
      await runHkgovAlsIngestCommand(args, target, printUsage)
      return
    }
    case 'hkgov-pland:prepare': {
      const { runHkgovPlandPrepCommand } = await import('./commands/hkgovPland.ts')
      await runHkgovPlandPrepCommand(args, printUsage)
      return
    }
    case 'hkgov-pland:backfill': {
      const kind = args.options.kind
      if (kind !== 'pu' && kind !== 'new-town') {
        printUsage()
        throw new Error('hkgov-pland:backfill requires --kind pu or --kind new-town.')
      }
      const { runHkgovPlandBackfillCommand } = await import(
        './commands/backfillHkgovPland.ts'
      )
      await runHkgovPlandBackfillCommand(
        withoutOption(args, 'kind'),
        target,
        kind,
        printUsage,
      )
      return
    }
    case 'hkgov-pland:ingest': {
      const kind = args.options.kind
      if (kind !== 'pu' && kind !== 'new-town') {
        printUsage()
        throw new Error('hkgov-pland:ingest requires --kind pu or --kind new-town.')
      }
      const { runHkgovPlandNativeArchiveIngestCommand } = await import(
        './commands/backfillHkgovPland.ts'
      )
      await runHkgovPlandNativeArchiveIngestCommand(
        withoutOption(args, 'kind'),
        target,
        kind,
        printUsage,
      )
      return
    }
    case 'hkgov-censtatd:district-land-area-population-density': {
      const { runHkgovCenstatdDistrictStatisticIngestCommand } = await import(
        './commands/hkgovCenstatdDistrictStatistics.ts'
      )
      await runHkgovCenstatdDistrictStatisticIngestCommand(args, target, printUsage)
      return
    }
    case 'hkgov-landsd-streets:baseline':
    case 'hkgov-landsd-streets:landsd-notices':
    case 'hkgov-landsd-streets:official-egazette': {
      const { runLandsdStreetStageCommand } = await import(
        './commands/ingestLandsdStreets.ts'
      )
      const stage = args.command.replace('hkgov-landsd-streets:', '') as
        | 'baseline'
        | 'landsd-notices'
        | 'official-egazette'
      await runLandsdStreetStageCommand(args, target, stage, printUsage)
      return
    }
    case 'hkgov-landsd-streets:assemble': {
      const { runLandsdStreetAssembleCommand } = await import(
        './commands/ingestLandsdStreets.ts'
      )
      await runLandsdStreetAssembleCommand(args, target, printUsage)
      return
    }
    case 'hkgov-hkgro-street-names:retrieve': {
      const { runHkgroStreetNameRetrieveCommand } = await import(
        './commands/hkgroStreetNames.ts'
      )
      await runHkgroStreetNameRetrieveCommand(args, target, printUsage)
      return
    }
    case 'hkgov-hkgro-street-names:ocr': {
      const { runHkgroStreetNameOcrCommand } = await import(
        './commands/hkgroStreetNamesOcr.ts'
      )
      await runHkgroStreetNameOcrCommand(args, target, printUsage)
      return
    }
    case 'hkgov-hkgro-street-names:discover': {
      const { runHkgroStreetNameDiscoverCommand } = await import(
        './commands/hkgroStreetNamesDiscover.ts'
      )
      await runHkgroStreetNameDiscoverCommand(args, target, printUsage)
      return
    }
    case 'hkgov-hkgro-street-names:review': {
      const { runHkgroStreetNameReviewCommand } = await import(
        './commands/hkgroStreetNamesReview.ts'
      )
      await runHkgroStreetNameReviewCommand(args, target, printUsage)
      return
    }
    default:
      throw new Error(`Unsupported Harbour DataOps command: ${args.command}`)
  }
}

main().catch(error => {
  cancel(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
