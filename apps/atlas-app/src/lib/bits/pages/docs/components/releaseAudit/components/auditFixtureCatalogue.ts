import type { Json } from '@repo/core/provenance'
import { alsAuditDecisions, type AlsDecisionKind } from './auditAlsDecisions'
import { auditFixtureRows, fixtureRowSearchText, rowKeys } from './auditFixtureRows'
import { auditSearchText, matchesAuditText } from './auditSearch'

export type FixtureSearchGroup = { rows: string[]; text: string | null }
export type AlsSearchRow = {
  kind: AlsDecisionKind
  title: string
  description: string
  text: string
}
export type FixtureCatalogue = {
  groups: Record<string, Record<string, FixtureSearchGroup>>
  als: AlsSearchRow[]
}

/** Searchable presentation metadata; evidence is fetched only when displayed. */
export function auditFixtureCatalogue(
  groups: Record<string, Record<string, Json>>,
  releaseCode: string,
): FixtureCatalogue {
  return {
    groups: Object.fromEntries(
      Object.entries(groups).map(([id, tables]) => [
        id,
        Object.fromEntries(
          Object.entries(tables).map(([type, value]) => [
            type,
            {
              rows: auditFixtureRows(value).map(fixtureRowSearchText),
              text:
                value &&
                typeof value === 'object' &&
                !Array.isArray(value) &&
                rowKeys.some(key => Array.isArray(value[key]))
                  ? null
                  : auditSearchText(value),
            },
          ]),
        ),
      ]),
    ),
    als: alsAuditDecisions(groups['curate-als-addresses'] ?? {}, releaseCode).map(
      d => ({
        kind: d.kind,
        title: d.title,
        description: d.description,
        text: auditSearchText(d.title, d.description, d.context, d.raw),
      }),
    ),
  }
}

export const catalogueGroupMatches = (group: FixtureSearchGroup, query: string) =>
  group.text === null
    ? group.rows.some(text => matchesAuditText(query, text))
    : matchesAuditText(query, group.text)
