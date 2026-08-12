import { expect, test } from 'bun:test'
import {
  createMapStyleFragment,
  mapStyleDefinition,
  mapStyleDefinitions,
  mapStyleFlavor,
} from './styles'

test('publishes the official Protomaps flavours and SaanSeoi Midnight', () => {
  expect(mapStyleDefinitions.map(style => style.id)).toEqual([
    'light',
    'dark',
    'white',
    'grayscale',
    'black',
    'midnight',
  ])
  expect(
    mapStyleDefinitions.filter(style => style.provenance === 'protomaps'),
  ).toHaveLength(5)
})

test('builds a source-neutral MapLibre style fragment', () => {
  const style = createMapStyleFragment('midnight')
  expect(style.version).toBe(8)
  expect(style.metadata['saanseoi:style']).toEqual({
    id: 'midnight',
    version: mapStyleDefinition('midnight').version,
    sourceId: 'basemap',
    sourceRequired: true,
  })
  expect(style.layers.length).toBeGreaterThan(0)
  expect(mapStyleFlavor('midnight').background).toBe('#020617')
})
