import importlib.util
from pathlib import Path
import unittest
from shapely.geometry import box
from shapely.ops import unary_union

spec = importlib.util.spec_from_file_location('hma_audit', Path(__file__).with_name('audit-hma-hierarchy.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


def district(code, geometry):
    return {'properties': {'dc_class': code, 'dc_eng': code}, 'geometry': geometry,
            'sourceGeometryHash': 'test', 'analysisGeometryRepaired': False}


class HierarchyAuditTest(unittest.TestCase):
    def measure(self, geometry, districts):
        return module.measure(geometry, districts, unary_union([d['geometry'] for d in districts]))

    def test_boundary_touch_does_not_add_parent(self):
        result = self.measure(box(0, 0, 1, 1), [district('A', box(0, 0, 1, 1)), district('B', box(1, 0, 2, 1))])
        self.assertEqual(len(result['districts']), 1)
        self.assertTrue(result['districts'][0]['fullContainment'])

    def test_real_split_retains_both_branches(self):
        result = self.measure(box(0, 0, 2, 1), [district('A', box(0, 0, 1, 1)), district('E', box(1, 0, 2, 1))])
        self.assertEqual([d['fractionOfHma'] for d in result['districts']], [.5, .5])
        self.assertEqual([d['candidatePath'][1] for d in result['districts']], ['Hong Kong Island', 'Kowloon'])
        self.assertFalse(any(d['fullContainment'] for d in result['districts']))

    def test_uncovered_area_not_normalised_away(self):
        result = self.measure(box(0, 0, 2, 1), [district('A', box(0, 0, 1, 1))])
        self.assertEqual(result['uncoveredFraction'], .5)
        self.assertEqual(result['districts'][0]['fractionOfHma'], .5)
        self.assertEqual(result['classification'], 'single-district-with-remainder')

    def test_tiny_overlap_is_visible_not_full_containment(self):
        result = self.measure(box(0, 0, 1, 1), [district('A', box(0, 0, .99999999, 1))])
        self.assertFalse(result['districts'][0]['fullContainment'])
        self.assertGreater(result['uncoveredFraction'], 0)

    def test_cutoff_is_inclusive_and_excludes_uncovered_area(self):
        # Of 200 m², only 100 m² is district-covered. B has exactly 5% of that.
        result = self.measure(box(0, 0, 200, 1), [
            district('A', box(0, 0, 95, 1)), district('B', box(95, 0, 100, 1))])
        self.assertEqual(len(result['suggestedHierarchies']['full']), 2)
        self.assertEqual(result['hierarchyDecisions'][1]['fractionOfCoveredHma'], .05)
        self.assertFalse(result['hierarchyDecisions'][1]['fullContainment'])

    def test_below_cutoff_retained_as_rejected_evidence(self):
        result = self.measure(box(0, 0, 100, 1), [
            district('A', box(0, 0, 95.001, 1)), district('B', box(95.001, 0, 100, 1))])
        self.assertEqual(len(result['suggestedHierarchies']['full']), 1)
        self.assertFalse(result['hierarchyDecisions'][1]['selected'])
        self.assertEqual(len(result['districts']), 2)

    def test_unmatched_is_explicit(self):
        result = self.measure(box(2, 2, 3, 3), [district('A', box(0, 0, 1, 1))])
        self.assertEqual(result['classification'], 'unmatched')
        self.assertEqual(result['suggestedHierarchies']['full'], [])
        self.assertEqual(result['uncoveredFraction'], 1)


if __name__ == '__main__':
    unittest.main()
