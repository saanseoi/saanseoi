import { resolve } from 'node:path'

import { prepareLandsdStreetInitialParquet } from '../apps/harbour-cli/src/lib/landsdStreet.ts'

const inputPdf = process.argv[2]
const outputFile =
  process.argv[3] ??
  'data/hkgov/landsd/street/2025-12-19.0/landsd-street-2025-12-19.0.parquet'

if (!inputPdf) {
  console.error(
    'Usage: bun scripts/prepare-landsd-street.ts <Gazetted_Street_Name.pdf> [output.parquet]',
  )
  process.exit(1)
}

const result = await prepareLandsdStreetInitialParquet({
  inputPdf: resolve(inputPdf),
  outputFile: resolve(outputFile),
})
console.log(`Wrote ${result.rowCount} LandsD street rows to ${result.outputFile}`)
