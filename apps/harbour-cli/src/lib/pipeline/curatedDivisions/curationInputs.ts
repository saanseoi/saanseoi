import { divisionCuration as definitions } from '@repo/core/pipeline/services/divisions/curationInventory'
import geometry from '../../../../../../fixtures/meta/curations/saanseoi-division/division-geometry.json'
import selections from '../../../../../../fixtures/meta/curations/saanseoi-division/division-geometry-selections.json'
import points from '../../../../../../fixtures/meta/curations/saanseoi-division/division-point-overrides.json'
import bounds from '../../../../../../fixtures/meta/curations/saanseoi-division/division-bounds-overrides.json'
/** Authored polygons are an assembly/editor input, never a Worker module dependency. */
export const divisionCuration = { ...definitions, geometry, selections, points, bounds }
