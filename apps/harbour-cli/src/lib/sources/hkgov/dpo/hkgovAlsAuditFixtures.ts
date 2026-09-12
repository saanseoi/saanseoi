import reviewedPremiseRetentions from '../../../../../../../fixtures/meta/curations/hkgov-dpo-address-reviewed-premise-retentions.json'
import buildingOverrides from '../../../../../../../fixtures/meta/curations/hkgov-dpo-address-building-overrides.json'
import blockDetailBackfills from '../../../../../../../fixtures/meta/curations/hkgov-dpo-address-block-detail-backfills.json'
import identityComponentBackfills from '../../../../../../../fixtures/meta/curations/hkgov-dpo-address-identity-component-backfills.json'
import houseStreetIdentities from '../../../../../../../fixtures/meta/curations/hkgov-dpo-address-house-street-identities.json'
import premiseRenames from '../../../../../../../fixtures/meta/curations/hkgov-dpo-address-premise-renames.json'
import fixture0 from '../../../../../../../fixtures/meta/curations/address-granularity.json'
import fixture1 from '../../../../../../../fixtures/meta/curations/hkgov-dpo-address-2d-backfills.json'
import fixture2 from '../../../../../../../fixtures/meta/curations/hkgov-dpo-address-3d-backfills.json'
import fixture3 from '../../../../../../../fixtures/meta/curations/hkgov-dpo-address-3d-corrections.json'
import fixture4 from '../../../../../../../fixtures/meta/curations/hkgov-dpo-address-3d-suppressions.json'
import fixture5 from '../../../../../../../fixtures/meta/curations/hkgov-dpo-address-aliased-premise-coalescences.json'
import fixture6 from '../../../../../../../fixtures/meta/curations/hkgov-dpo-address-approved-estate-batch.json'
import fixture7 from '../../../../../../../fixtures/meta/curations/hkgov-dpo-address-approved-issue-batch.json'
import fixture8 from '../../../../../../../fixtures/meta/curations/hkgov-dpo-address-commercial-retentions.json'
import fixture9 from '../../../../../../../fixtures/meta/curations/hkgov-dpo-address-complex-promotions.json'
import fixture10 from '../../../../../../../fixtures/meta/curations/hkgov-dpo-address-components.json'
import fixture11 from '../../../../../../../fixtures/meta/curations/hkgov-dpo-address-coordinate-backfills.json'
import fixture12 from '../../../../../../../fixtures/meta/curations/hkgov-dpo-address-csu-corrections.json'
import fixture13 from '../../../../../../../fixtures/meta/curations/hkgov-dpo-address-estate-complex-decisions.json'
import fixture14 from '../../../../../../../fixtures/meta/curations/hkgov-dpo-address-estate-component-gaps.json'
import fixture15 from '../../../../../../../fixtures/meta/curations/hkgov-dpo-address-estate-components.json'
import fixture16 from '../../../../../../../fixtures/meta/curations/hkgov-dpo-address-estate-names.json'
import fixture17 from '../../../../../../../fixtures/meta/curations/hkgov-dpo-address-hierarchies.json'
import fixture18 from '../../../../../../../fixtures/meta/curations/hkgov-dpo-address-house-retentions.json'
import fixture19 from '../../../../../../../fixtures/meta/curations/hkgov-dpo-address-lin-tsui.json'
import fixture20 from '../../../../../../../fixtures/meta/curations/hkgov-dpo-address-localities.json'
import fixture21 from '../../../../../../../fixtures/meta/curations/hkgov-dpo-address-named-premise-retentions.json'
import fixture22 from '../../../../../../../fixtures/meta/curations/hkgov-dpo-address-nested-premises.json'
import fixture23 from '../../../../../../../fixtures/meta/curations/hkgov-dpo-address-oi-hei-backfill.json'
import fixture24 from '../../../../../../../fixtures/meta/curations/hkgov-dpo-address-premise-consolidations.json'
import fixture25 from '../../../../../../../fixtures/meta/curations/hkgov-dpo-address-premise-reconstructions.json'
import fixture26 from '../../../../../../../fixtures/meta/curations/hkgov-dpo-address-reviewed-estate-ownership.json'
import fixture27 from '../../../../../../../fixtures/meta/curations/hkgov-dpo-address-school-reconciliations.json'
import fixture28 from '../../../../../../../fixtures/meta/curations/hkgov-dpo-address-street-estate-complexes.json'
import fixture29 from '../../../../../../../fixtures/meta/curations/hkgov-dpo-address-tsz-fai-dated-event.json'
import fixture30 from '../../../../../../../fixtures/meta/curations/hkgov-dpo-address-unnamed-premise-suppressions.json'
import fixture31 from '../../../../../../../fixtures/meta/curations/hkgov-dpo-address-upper-estate-complexes.json'
import fixture32 from '../../../../../../../fixtures/meta/curations/hkgov-dpo-address-yau-yue-decisions.json'
import fixture33 from '../../../../../../../fixtures/meta/curations/hkgov-dpo-address-yung-shing-shared-building.json'

/** These are the same imported documents used by the ALS processors. */
export const alsAuditFixtures = [
  {
    type: 'hkgov-dpo-address-reviewed-premise-retentions',
    document: reviewedPremiseRetentions,
  },
  {
    type: 'hkgov-dpo-address-house-street-identities',
    document: houseStreetIdentities,
  },
  { type: 'hkgov-dpo-address-block-detail-backfills', document: blockDetailBackfills },
  { type: 'hkgov-dpo-address-building-overrides', document: buildingOverrides },
  {
    type: 'hkgov-dpo-address-identity-component-backfills',
    document: identityComponentBackfills,
  },
  { type: 'hkgov-dpo-address-premise-renames', document: premiseRenames },
  { type: 'address-granularity', document: fixture0 },
  { type: 'hkgov-dpo-address-2d-backfills', document: fixture1 },
  { type: 'hkgov-dpo-address-3d-backfills', document: fixture2 },
  { type: 'hkgov-dpo-address-3d-corrections', document: fixture3 },
  { type: 'hkgov-dpo-address-3d-suppressions', document: fixture4 },
  { type: 'hkgov-dpo-address-aliased-premise-coalescences', document: fixture5 },
  { type: 'hkgov-dpo-address-approved-estate-batch', document: fixture6 },
  { type: 'hkgov-dpo-address-approved-issue-batch', document: fixture7 },
  { type: 'hkgov-dpo-address-commercial-retentions', document: fixture8 },
  { type: 'hkgov-dpo-address-complex-promotions', document: fixture9 },
  { type: 'hkgov-dpo-address-components', document: fixture10 },
  { type: 'hkgov-dpo-address-coordinate-backfills', document: fixture11 },
  { type: 'hkgov-dpo-address-csu-corrections', document: fixture12 },
  { type: 'hkgov-dpo-address-estate-complex-decisions', document: fixture13 },
  { type: 'hkgov-dpo-address-estate-component-gaps', document: fixture14 },
  { type: 'hkgov-dpo-address-estate-components', document: fixture15 },
  { type: 'hkgov-dpo-address-estate-names', document: fixture16 },
  { type: 'hkgov-dpo-address-hierarchies', document: fixture17 },
  { type: 'hkgov-dpo-address-house-retentions', document: fixture18 },
  { type: 'hkgov-dpo-address-lin-tsui', document: fixture19 },
  { type: 'hkgov-dpo-address-localities', document: fixture20 },
  { type: 'hkgov-dpo-address-named-premise-retentions', document: fixture21 },
  { type: 'hkgov-dpo-address-nested-premises', document: fixture22 },
  { type: 'hkgov-dpo-address-oi-hei-backfill', document: fixture23 },
  { type: 'hkgov-dpo-address-premise-consolidations', document: fixture24 },
  { type: 'hkgov-dpo-address-premise-reconstructions', document: fixture25 },
  { type: 'hkgov-dpo-address-reviewed-estate-ownership', document: fixture26 },
  { type: 'hkgov-dpo-address-school-reconciliations', document: fixture27 },
  { type: 'hkgov-dpo-address-street-estate-complexes', document: fixture28 },
  { type: 'hkgov-dpo-address-tsz-fai-dated-event', document: fixture29 },
  { type: 'hkgov-dpo-address-unnamed-premise-suppressions', document: fixture30 },
  { type: 'hkgov-dpo-address-upper-estate-complexes', document: fixture31 },
  { type: 'hkgov-dpo-address-yau-yue-decisions', document: fixture32 },
  { type: 'hkgov-dpo-address-yung-shing-shared-building', document: fixture33 },
]
