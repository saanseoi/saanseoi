import geographic from '../../../../fixtures/meta/divisionCodes/geographic.json'
import newTowns from '../../../../fixtures/meta/divisionCodes/hkgov-pland-new-town.json'
import housingAreas from '../../../../fixtures/meta/divisionCodes/hkgov-censtatd-hma.json'

const codes = new Map(
  [...geographic.assignments, ...newTowns.assignments, ...housingAreas.assignments].map(
    row => [row.canonicalId, row.divisionCode],
  ),
)
/** Display lookup only; never used to change the reviewed identity target. */
export const auditDivisionCode = (canonicalId: string) => codes.get(canonicalId)
