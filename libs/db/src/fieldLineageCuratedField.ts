import { curatedPreparationField } from './fieldLineageHuman'
import type { PreparedInputContext } from './fieldLineagePreparedInputs'
import type { Node } from './fieldLineageTypes'

/** Field projection through the archive envelope; record-wide checks remain evidence. */
export function compileCuratedRecordField(
  path: string,
  context: Pick<
    PreparedInputContext,
    'scope' | 'addNode' | 'operation' | 'curatedRecord'
  >,
) {
  const field = path.slice('record.'.length)
  const inputs: Node['inputs'] = {
    value:
      field === 'cartography'
        ? compileCuratedRecordField('record.class', context)
        : {
            stage: 'raw',
            scope: context.scope.raw,
            collection: 'archiveRows',
            path: field,
            role: 'value',
          },
    envelope: { ...context.curatedRecord(), role: 'evidence' },
  }
  return context.addNode({
    id: `${context.scope.id}-curated-field-${field}`,
    stage: 'preparation',
    output: { scope: context.scope.prepared, collection: 'rows', path },
    layer: 'baseline',
    priority: 0,
    audit: { category: 'rules', scope: 'bulk', retention: 'counts' },
    inputs,
    when: { kind: 'always' },
    onAbsent: 'null',
    onFailure: 'error',
    operation: context.operation(
      'curated-record-field',
      {
        human: curatedPreparationField(path),
        expression: `JSON.stringify(record) carries ${path} into the prepared archive row.`,
        implementation: {
          path: 'apps/harbour-cli/src/lib/pipeline/curatedDivisions/archiveInput.ts',
          symbol: 'curatedArchiveRows',
        },
        additionalImplementations: [
          {
            path: 'libs/core/src/pipeline/services/divisions/curationInventory.ts',
            symbol: 'sourceDivisionClass',
          },
          {
            path: 'libs/core/src/pipeline/services/divisions/curationInventory.ts',
            symbol: 'sourceDivisionNames',
          },
          {
            path: 'libs/core/src/pipeline/services/divisions/curatedDivisionPolicy.ts',
            symbol: 'applyCuratedDivisionNames',
          },
          {
            path: 'libs/db/src/divisionTaxonomy.ts',
            symbol: 'geographicDivisionClassification',
          },
          { path: 'libs/db/src/divisionTaxonomy.ts', symbol: 'classifyIslandArea' },
          { path: 'libs/db/src/divisionTaxonomy.ts', symbol: 'divisionCartography' },
          {
            path: 'apps/harbour-cli/src/lib/pipeline/curatedDivisions/resolveHierarchies.ts',
            symbol: 'resolveCuratedHierarchies',
          },
          {
            path: 'apps/harbour-cli/src/lib/pipeline/curatedDivisions/reviewInputs.ts',
            symbol: 'loadDivisionReviewInputs',
          },
          {
            path: 'apps/harbour-cli/src/lib/pipeline/curatedDivisions/assemble.ts',
            symbol: 'assembleCuratedDivisions',
          },
          {
            path: 'apps/harbour-cli/src/lib/pipeline/curatedDivisions/buildRelease.ts',
            symbol: 'buildCuratedDivisionRelease',
          },
          {
            path: 'apps/harbour-cli/src/lib/pipeline/curatedDivisions/recordContract.ts',
            symbol: 'applyCuratedRecordContract',
          },
        ],
        explanation: {
          version: 1,
          result: { kind: 'read', path: `archiveRows.${field}` },
        },
      },
      inputs,
    ),
  })
}
