import vocabulary from './place-filter-vocabulary.json'

const unique = (values: string[]) => [...new Set(values)].sort()

export const placeBasicCategories = unique(
  vocabulary.catalogues.flatMap(catalogue => catalogue['Basic Level Category']),
)

export const placeTaxonomyCategories = unique(
  vocabulary.catalogues.flatMap(catalogue => catalogue['New Primary Category']),
)

const list = (values: string[]) => values.map(value => `\`${value}\``).join(', ')
const sources = vocabulary.catalogues
  .map(
    ({ source }) =>
      `[Latest vocabulary](https://github.com/OvertureMaps/docs/blob/${vocabulary.revision}/docs/guides/places/csv/${source})`,
  )
  .join(', ')

const scope = `${sources}; availability varies by release and region.`

export const placeBasicCategoryFilterDescription = [
  `Exact basic category. ${scope}`,
  `Possible values: ${list(placeBasicCategories)}`,
].join('\n\n')

export const placeTaxonomyFilterDescription = [
  `Exact primary category. ${scope}`,
  `Possible values: ${list(placeTaxonomyCategories)}`,
].join('\n\n')

export const placeOperatingStatusFilterDescription =
  'Filter by operating status. Full list: `open`, `temporarily_closed`, `permanently_closed`. This describes continued operation, not opening hours or whether the Place is open right now.'
