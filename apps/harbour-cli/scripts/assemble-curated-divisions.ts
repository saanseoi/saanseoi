import { reconcileDraftReleaseSets } from '../src/lib/upload/upload'
import { publishLocalCuratedDivisions } from '../src/lib/pipeline/curatedDivisions/publishLocal'
console.log(
  JSON.stringify(
    await publishLocalCuratedDivisions({ environment: 'dev', remote: false } as never),
    null,
    2,
  ),
)

await reconcileDraftReleaseSets(
  { environment: 'dev', remote: false },
  { apiFamily: 'divisions', regionCode: 'hk' },
)
