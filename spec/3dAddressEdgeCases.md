# 3D address edge cases

This note records the boundary between a two-dimensional premise address and a
unit-level address. It is deliberately a design note, not a promise that every form is
parsed today.

## Canonical model

`address2d` identifies a physical premise. `address3d` contains the unit inventory owned
by one Address2D, with one collection per owner and snapshot. A place can link to a
collection and stable unit ID while retaining its precise 2D address. A place which
names more than one premise must use a many-to-many association rather than collapse its
publisher address into one record.

The canonical 3D fields distinguish publisher styling from meaning:

- `unitExpression` and `floorExpression` preserve the parsed publisher-facing expression
  where available.
- Shared `units` JSON stores stable unit IDs, `unitRef`, `unitType`, `floorRef`,
  `floorType` and optional unit-portion meaning. Locale JSON is keyed by the same IDs.
- Unit codes are `F` flat, `R` room, `S` shop, `SU` suite, `U` unit, `ST` stall, `K`
  kiosk, `O` office and `X` other. Floor codes are `F` ordinary floor, `G` ground, `UG`
  upper ground, `LG` lower ground, `B` basement, `M` mezzanine, `C` concourse, `P`
  podium, `R` roof and `X` other. Unknown ALS descriptors require review rather than
  silently falling back to `X`.
- `unitRef` and `floorRef` are the identifier tokens used for lookup.
- `formattedAddressPart` is an optional override when the retained expressions cannot
  reproduce the required formatting. Publisher source objects remain separate evidence.

There is no per-unit lookup table. Ordinary address reads expose coverage metadata;
explicit unit requests load the collection. Place unit matching requires a unique,
explicit floor/flat pair in the selected snapshot. Ambiguous expressions remain
unlinked. `accessHint` belongs to Place localisation, never to a building's inventory.

Man Hong House has one curated 762–774 building parent and one 422-unit collection. Its
six numbered children are sections with explicitly unresolved parent-level unit
coverage. Neither repeated inventories nor the range establish unit-to-section
membership. No. 772/post office receives no residential coverage. Unit IDs derive from
the canonical physical-building identity and semantic tokens, not feature order or
provisional section membership.

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
