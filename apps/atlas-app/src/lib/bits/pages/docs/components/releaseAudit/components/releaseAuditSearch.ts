const searchTerms = (value: string) =>
  value.match(/[\p{L}\p{N}\p{M}][\p{L}\p{N}\p{M}_.:-]*/gu) ?? []

const isFuzzyTermMatch = (term: string, query: string) => {
  if (term.includes(query)) return true

  let cursor = 0
  for (const character of term) {
    if (character === query[cursor]) cursor += 1
    if (cursor === query.length) return true
  }

  return false
}

export const matchesFuzzyQuery = (text: string, query: string) => {
  const queryTerms = searchTerms(query.normalize('NFKD').toLocaleLowerCase())
  if (!queryTerms.length) return true

  const terms = searchTerms(text.normalize('NFKD').toLocaleLowerCase())
  return queryTerms.every(queryTerm =>
    terms.some(term => isFuzzyTermMatch(term, queryTerm)),
  )
}
