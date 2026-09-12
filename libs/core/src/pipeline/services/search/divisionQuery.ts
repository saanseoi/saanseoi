/** Literal text only: FTS operators and SQL wildcard characters are never syntax. */
export function divisionSearchTerms(query: string) {
  return query.normalize('NFKC').match(/[\p{L}\p{N}]+/gu) ?? []
}
