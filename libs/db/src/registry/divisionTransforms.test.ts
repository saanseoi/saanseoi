import { expect, test } from 'bun:test'
import { initialDatasetTransforms } from './meta'

test('registers simplified HAD and Planning geometry for every declared release', () => {
  const datasets = [
    ['hkgov-had-hk-division-area-district', 'hkgov-had'],
    ['hkgov-pland-hk-division-pu', 'hkgov-pland-pu'],
    ['hkgov-pland-hk-division-new-town', 'hkgov-pland-new-town'],
  ] as const
  for (const [name, variant] of datasets) {
    const fixture = require(`../../../../fixtures/meta/datasets/${name}.json`)
    const transforms = initialDatasetTransforms.filter(
      transform => transform.datasetCode === fixture.code,
    )
    expect(transforms.map(transform => transform.sourceVersion).sort()).toEqual(
      fixture.releases
        .map((release: { sourceVersion: string }) => release.sourceVersion)
        .sort(),
    )
    for (const transform of transforms) {
      expect(transform).toMatchObject({
        code: 'simplified',
        resourceType: 'divisionArea',
        outputVariant: `${variant}:simplified`,
        derivation: {
          toleranceMetres: 10,
          sharedBoundaryPolicy: 'geos-coverage-simplification',
          preservesPublisherGeometry: true,
        },
      })
    }
  }
})
