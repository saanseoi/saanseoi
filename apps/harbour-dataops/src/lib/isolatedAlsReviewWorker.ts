import { prepareHkgovAlsRelease } from '../commands/hkgovAls.ts'

const [request, output] = process.argv.slice(2)
if (!request || !output)
  throw new Error('ALS review worker requires request and output paths')
const input = await Bun.file(request).json()
const result = await prepareHkgovAlsRelease({ ...input, writeOutput: false })
await Bun.write(
  output,
  JSON.stringify({
    identityRecords: result.identityRecords,
    driftCandidates: result.driftCandidates,
    curationApplications: result.curationApplications,
    divisionQuality: result.divisionQuality,
  }),
)
