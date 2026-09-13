import {
  formatIslandReviewTable,
  runIslandCurationReview,
  writeIslandReviewMarkdown,
} from '../apps/harbour-cli/src/lib/pipeline/islands/islandCuration.ts'

const result = await runIslandCurationReview()
await writeIslandReviewMarkdown(result)
console.log(
  JSON.stringify(
    {
      ready: result.ready,
      islands: result.islands.length,
      pending: result.pending.length,
      uncuratedBasemap: result.uncuratedBasemap.length,
      uncuratedLandsd: result.uncuratedLandsd.length,
      gainedGeometry: result.gainedGeometry.length,
      sourceReleases: result.sourceReleases,
    },
    null,
    2,
  ),
)
console.log(
  'English Name | Chinese Name | Alternatives English | Alternatives Chinese | Size',
)
console.log(formatIslandReviewTable(result))
