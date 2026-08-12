/**
 * Unstable v0 Divisions handler bundle.
 *
 * v0 intentionally follows the current shared implementation while the catalogue,
 * lineage, and bitemporal serving model is being established. Stable API minors
 * must retain their own handler module when observable data or response shape
 * changes.
 */
export {
  getDivisionDetail,
  listDivisions,
  type DivisionDetailQuery,
  type DivisionDetailResult,
  type DivisionListQuery,
  type DivisionListResult,
  type RequestedDivisionApiVersion,
  type RequestedDivisionVersion,
  type ResolvedDivisionApiVersion,
} from '../../services/divisions'
