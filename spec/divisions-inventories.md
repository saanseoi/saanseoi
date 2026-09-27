# Division domains, inventories and release contracts

Status: API `0.2` runtime and registry definitions are implemented. Data publication
requires complete reviewed monthly ingredients; route availability alone does not imply
a published edition.

## Vocabulary

| Term             | Meaning                                                                                                                   |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Source dataset   | An independently released body of evidence from a publisher, including a derived SaanSeoi dataset.                        |
| Domain           | A system of geographic meaning, such as general geography, planning units or housing market areas.                        |
| Inventory        | A selectable collection of the domain's primary resource type, including its identities, attributes, names and hierarchy. |
| Geometry variant | An alternative area or boundary representation compatible with the selected inventory.                                    |
| API release set  | An immutable selection of inventory and companion snapshots exposed together by an API contract.                          |

`inventory` names the primary resource selection within a domain. It is not a synonym
for `source`, `domain`, `divisionArea`, or a union of all available divisions. The
Divisions family's primary resource type is `division`; the same vocabulary applies to
other families according to their declared `primaryResourceType`.

Internal snapshot `variant` values may identify both inventory and geometry lineages.
Public discovery and selection distinguish their roles explicitly. A snapshot's presence
as an input dependency does not make it a selectable inventory.

## Domain organisation

| Domain                 | Inventories                                   | Geometry companions                                                                                     |
| ---------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `geographic`           | `saanseoi` (default in API `0.2`), `overture` | SaanSeoi areas, Overture areas and boundaries, and specifically identified compatible government areas. |
| `hkgov-landsd`         | `hkgov-landsd` settlement-name points         | Only explicitly evidenced settlement geometry, if available.                                            |
| `hkgov-pland-pu`       | Planning units                                | Corresponding planning-unit areas.                                                                      |
| `hkgov-censtatd-hma`   | Housing market areas                          | Corresponding housing-market areas.                                                                     |
| `hkgov-pland-new-town` | New towns                                     | Corresponding new-town areas.                                                                           |

SaanSeoi and Overture are alternative interpretations of general geography. Selecting
one inventory selects its complete published identity and hierarchy contract. It does
not mix primary rows or ancestry from the other inventory.

LandsD settlement-name points remain a distinct domain because they do not define the
same hierarchy. Reviewed LandsD name matches can also contribute evidence to SaanSeoi
records. Government area variants retain specific provider and vintage identifiers;
there is no undifferentiated `hkgov` geometry choice.

## Selection and discovery

The request uses `domain=geographic&inventory=saanseoi`. Omitting `inventory` selects
the default declared by the selected API release set. An explicit inventory selects only
snapshots exposed as inventories by that release set, never whichever upstream snapshot
happens to be current.

Illustrative requests:

```text
/divisions/v0.2?domain=geographic&inventory=saanseoi&include=areas
/divisions/v0.2?domain=geographic&inventory=overture&include=areas:overture
```

Domain discovery describes the primary resource type, default inventory, available
inventories, and geometry compatibility for each inventory. Release-specific discovery
reports what that release actually contains, rather than treating every source dataset
in the registry as available. Responses identify the resolved inventory alongside the
domain, release set and catalogue revision. Reproducible links retain the inventory.

The `/divisions/v0.2/inventories` endpoint reports release-specific choices. A minimal
illustrative response is:

```json
{
  "domain": "geographic",
  "primaryResourceType": "division",
  "defaultInventory": "saanseoi",
  "inventories": [
    {
      "code": "saanseoi",
      "defaultAreaVariant": "saanseoi",
      "areaVariants": ["saanseoi", "overture"]
    },
    {
      "code": "overture",
      "defaultAreaVariant": "overture",
      "areaVariants": ["overture"]
    }
  ]
}
```

This example omits snapshot identities and additional evidenced government companions.
The release-specific representation must pin snapshot identities and expose only
validated combinations. `inventory=saanseoi` selects `division` here because that is the
family's primary resource type; `include=areas:overture` selects a companion, not
another inventory.

The selector applies consistently to lists, details, hierarchy traversal, search,
geocoding and change comparisons. Pagination, response caches and search indexes must
include the selected inventory in their scope. Change comparisons remain within an
inventory; a change of default is not reported as ordinary record churn.

An unknown inventory or an inventory from another domain is rejected. A recognised
inventory absent from the selected release produces an explicit selection conflict, not
a fallback to the default. An explicit `releaseSet` remains authoritative: inventory
selection cannot silently choose a different release set or reinterpret its membership.

## Geometry compatibility

Geometry is selected after the inventory. Bare `areas` resolves the configured area
default for that inventory in the selected release. Qualified includes retain the
[geometry selection contract](divisions-geometry.md).

Compatible geometry requires a shared, reviewed identity or an explicit crosswalk.
Matching names alone are insufficient. Inventory selection and geometry selection are
not an unrestricted Cartesian product. Defaults and available combinations are recorded
in release metadata and validated before publication.

A division without a compatible polygon remains in the inventory without an area.
Missing coverage is reported explicitly. The assembler may deliberately incorporate an
Overture polygon into a SaanSeoi area edition; that polygon then belongs to the
immutable SaanSeoi edition and retains its upstream provenance. Request-time selection
must not silently substitute a newer upstream polygon.

Explicit dated geometry selection must retain the resolved companion release in response
metadata and reproducible links. It never changes the selected inventory or its
hierarchy.

## Raw, source, canonical and API responsibilities

1. Raw archives retain exact upstream bytes and checksums.
2. Source records preserve each publisher's assertions and release identity.
3. The SaanSeoi builder combines pinned upstream evidence and reviewed fixtures into
   independently versioned Division and DivisionArea archives.
4. Ordinary ingestion turns each archive into canonical snapshots. Canonical means a
   common storage contract; it does not merge inventories or erase source assertions.
5. An API release set pins the exposed inventory snapshots, geometry compatibility,
   defaults and companion snapshots.
6. A request selects one domain and inventory, then compatible companion geometry.

Upstream sources retain their own source releases, resource releases and release notes.
The SaanSeoi archive manifest records exact contributing versions and hashes. Its
release notes describe editorial decisions. API release notes describe the exposed
composition and consumer-visible changes.

Overture can be both an ingredient and a selectable inventory. Protomaps Islands is an
independent geometry input; retaining and displaying that source does not require
publishing it as a standalone division inventory. Source-page arrows describe provenance
dependencies, while domain discovery describes API choices.

## Version and edition boundary

| API contract | Default geographic inventory | Edition series                                                                  |
| ------------ | ---------------------------- | ------------------------------------------------------------------------------- |
| `0.1`        | Overture                     | Preserve the September 2025–August 2026 editions and their recorded membership. |
| `0.2`        | SaanSeoi                     | Begin with the first published reviewed edition, intended for September 2026.   |

The default switch is an explicit API contract boundary because identity, ancestry,
coverage and geocoding can change even when response fields retain the same shape. Each
contract has its own composition definition. Each data edition still receives its own
immutable release set; these are not two release sets spanning all dates.

An edition's cohort, publication time and upstream input dates are separate facts. Do
not backdate publication to the intended edition month. Historical release sets remain
reproducible and accessible; the end of an edition series is not an access expiry date.
Overture may continue with newer editions as an explicit inventory in `0.2`.

Do not rewrite published `0.1` release sets to give them the SaanSeoi default. Catalogue
and release resolution must be scoped by the requested API version. An unversioned or
aliased route needs an explicit documented policy; it must not bypass this boundary.

## Implementation acceptance criteria

- Preserve published release membership and introduce the separate `0.2` composition.
- Represent default and selectable inventories distinctly from upstream dependencies.
- Resolve the requested API version rather than a hard-coded `0.1` catalogue.
- Carry `inventory` through request validation, selection, response metadata, links,
  caching, search, geocoding and within-inventory change comparison.
- Validate area defaults and crosswalk compatibility per inventory and release.
- Cover default selection, explicit alternatives, unavailable combinations and pinned
  historical replay with contract tests.
- Update API discovery, OpenAPI, source/domain presentation and Create a Map guidance
  when the runtime contract is enabled.
- Publish `0.2` only after the required SaanSeoi and upstream snapshots are ready.
