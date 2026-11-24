import unittest
from graph import edge_properties, node_key, osm_tags

class GraphTests(unittest.TestCase):
    def row(self, **updates):
        return dict(Enabled=1, Location=2, Direction=0, AccessTimeID=None, FeatureType=1, WheelchairBarrier=2, **updates)

    def test_stacked_floors_never_share_nodes(self):
        self.assertNotEqual(node_key((1, 2, 3)), node_key((1, 2, 6)))
        self.assertEqual(node_key((1, 2, 3)), node_key((1, 2, 3.0000000001)))

    def test_disabled_unknown_and_time_restricted_are_excluded(self):
        for key, value in [('Enabled', 2), ('Location', None), ('Direction', None), ('AccessTimeID', 12)]:
            row=self.row(); row[key]=value
            self.assertIsNone(edge_properties(row))

    def test_backward_escalator_reverses_geometry_and_remains_one_way(self):
        row=self.row(); row.update(Direction=-1, FeatureType=8)
        props=edge_properties(row)
        self.assertTrue(props['reverse'])
        tags=osm_tags(dict(props, sourceId=1))
        self.assertEqual(tags['oneway:foot'], 'yes')
        self.assertEqual(tags['wheelchair'], 'no')

    def test_unpaid_edition_cannot_include_paid_edges(self):
        row=self.row(); row['Location']=3
        edge=dict(edge_properties(row), sourceId=1)
        self.assertIsNone(osm_tags(edge, unpaid=True))
        self.assertEqual(osm_tags(edge)['ss:access'], 'paid')

if __name__ == '__main__': unittest.main()
