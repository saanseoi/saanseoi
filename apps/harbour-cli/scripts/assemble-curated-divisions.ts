import { buildCuratedDivisionRelease } from '../src/lib/pipeline/curatedDivisions/buildRelease'

const result = await buildCuratedDivisionRelease(
  { environment: 'dev', remote: false },
  {
    outputDirectory: process.argv[2],
    edition: process.argv[3],
  },
)
console.log(JSON.stringify(result, null, 2))
