import {
  prepareStatisticsRebuild,
  readStatisticsRebuildInputs,
} from '../src/lib/pipeline/statistics/prepareStatisticsRebuild'

const [manifestPath, outputDirectory, ...extra] = process.argv.slice(2)
if (!manifestPath || !outputDirectory || extra.length) {
  throw new Error(
    'Usage: bun apps/harbour-cli/scripts/prepareStatisticsRebuild.ts INPUTS.json NEW_OUTPUT_DIRECTORY',
  )
}
const result = await prepareStatisticsRebuild(
  readStatisticsRebuildInputs(manifestPath),
  outputDirectory,
)
console.log(JSON.stringify(result, null, 2))
