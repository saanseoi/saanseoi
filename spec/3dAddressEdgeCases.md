# 3D address edge cases

This note records the boundary between a two-dimensional premise address and a
unit-level address. It is deliberately a design note, not a promise that every form is
parsed today.

## Canonical model

`address2d` identifies a physical premise. `address3d` identifies a locatable
sub-premise within it. A place can link to either, and a place which names more than one
premise must use a many-to-many association rather than collapse its publisher address
into one record.

The canonical 3D fields distinguish publisher styling from meaning:

- `unitExpression` and `floorExpression` preserve the parsed publisher-facing expression
  where available.
- `unitType` and `floorType` are small canonical enums; unrecognised types use `other`.
- `unitRef` and `floorRef` are the identifier tokens used for lookup.
- `formattedAddressPart` is SaanSeoi-formatted output, not a lossless upstream address.
  Source formatting remains under the publisher source key.

`address3dUnitRefLookup` follows the same exact-token and numeric-stem approach as
`address2dBuildingNumberLookup`.

## Cases requiring 3D parsing

The following forms cannot be faithfully represented as one 2D building number:

- More than two number tokens: `Shop T-SK10/11/12/19/20`.
- Multiple premises in one expression: `Shop 101 And Shop 201/2`.
- Compound unit/floor expressions: `G-1/01`, `B7/8/F`, and `Lift 17/18`.
- Publisher free-form address fragments that contain postal, operational, or access
  instructions rather than a premise component.

These should initially retain their source expression and be parsed only when a parser
can state its confidence and provenance. They must not be made into synthetic ranges by
splitting on every slash or hyphen.

## 2D range lookup rules

The lookup table stores exact query tokens and a separate optional `numericStem`. An
exact lookup for `5` therefore does not match `5A-5C`; a caller may explicitly perform a
partial/stem lookup for `5` when that is appropriate.

- With an explicit `-` connector, `56-60` expands as `56`, `58`, `60` when both
  endpoints share parity; mixed parity expands consecutively.
- `5C-5E` expands as `5C`, `5D`, `5E`.
- Endpoints carry `source_endpoint` evidence. Generated interior members carry
  `derived_member` plus `integer_consecutive`, `integer_alternating`, or
  `latin_suffix_consecutive` derivation.
- A source member explicitly listed in a publisher expression may use `source_member`
  evidence.

ALS 2D delivery supplies structured From/To values but no connector, so it stores only
its supplied endpoints. Future free-form sources may populate the connector after a
parser has established it.

## Non-address location syntax

Relative descriptions and milestones such as `18, 3/4咪` are not necessarily a unit or
an address range. Keep them as source text (and, where useful, `accessHint`) until a
location-reference model exists. Postal boxes, delivery offices, and operational
instructions likewise should not be forced into `unitRef` or `floorRef`.
