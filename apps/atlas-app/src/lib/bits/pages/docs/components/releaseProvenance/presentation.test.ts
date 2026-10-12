import { expect, test } from 'bun:test'
import type { LineageDefinition, Node } from '@repo/db/fieldLineageTypes'
import { traceNodes, conditionLabel } from './presentation'

test('trace includes all candidate branches and shared inputs once, before their consumers', () => {
  const nodes = [
    { id: 'raw', stage: 'ingestion', inputs: {} },
    { id: 'a', stage: 'assembly', inputs: { value: { node: 'raw' } } },
    { id: 'b', stage: 'assembly', inputs: { value: { node: 'raw' } } },
    { id: 'response', stage: 'composition', inputs: { value: { group: 'choice' } } },
    { id: 'unrelated', stage: 'preparation', inputs: {} },
  ] as Node[]
  const definition = {
    nodes,
    resolutionGroups: [{ id: 'choice', candidates: ['a', 'b'] }],
  } as LineageDefinition
  expect(traceNodes(definition, 'response').map(node => node.id)).toEqual([
    'raw',
    'a',
    'b',
    'response',
  ])
})
test('parallel branches follow processing stages and keep same-stage dependencies first', () => {
  const definition = {
    nodes: [
      { id: 'publisher', stage: 'ingestion', inputs: {} },
      { id: 'prepared-a', stage: 'preparation', inputs: {} },
      {
        id: 'assembly-a',
        stage: 'assembly',
        inputs: {
          evidence: { node: 'publisher' },
          record: { node: 'prepared-a' },
        },
      },
      { id: 'prepared-b', stage: 'preparation', inputs: {} },
      { id: 'curated', stage: 'ingestion', inputs: { record: { node: 'prepared-b' } } },
      {
        id: 'assembly-b',
        stage: 'assembly',
        inputs: { evidence: { node: 'curated' } },
      },
      { id: 'response', stage: 'composition', inputs: { value: { node: 'composed' } } },
      { id: 'composed', stage: 'composition', inputs: { value: { group: 'choice' } } },
    ],
    resolutionGroups: [{ id: 'choice', candidates: ['assembly-a', 'assembly-b'] }],
  } as LineageDefinition
  const ordered = traceNodes(definition, 'response')
  expect(ordered.map(node => node.id)).toEqual([
    'prepared-a',
    'prepared-b',
    'publisher',
    'curated',
    'assembly-a',
    'assembly-b',
    'composed',
    'response',
  ])
  // The UI derives both card numbers and input references from this ordering.
  const steps = new Map(ordered.map((node, index) => [node.id, index + 1]))
  expect(definition.resolutionGroups[0]?.candidates.map(id => steps.get(id))).toEqual([
    5, 6,
  ])
})
test('conditions display readable alternatives rather than object serialisation', () => {
  expect(
    conditionLabel({
      kind: 'any',
      conditions: [
        { kind: 'compare', input: 'profile', operator: 'in', value: ['map', 'full'] },
        { kind: 'unresolved', reason: 'upstream not retained' },
      ],
    }),
  ).toBe('profile in map, full or Unresolved: upstream not retained')
})
