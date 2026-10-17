# Localisation metadata

Each locale value carries `meta`. Relational CURRENT and HISTORY i18n tables store it in
a JSON text column. Locale-keyed JSON on an owning record stores the same object inside
each locale value.

```json
{
  "i18n": {
    "de": {
      "name": "Beispiel",
      "description": "Beschreibung",
      "meta": {
        "fields": {
          "name": { "origin": "human-translated", "translatorId": "translator-123" },
          "description": { "origin": "ai-translated", "isHumanVerified": true }
        }
      }
    }
  }
}
```

`isLocaleInferred` is optional and describes the assignment of the locale. Only `true`
is stored; omission means `false`. NULL metadata also means a non-inferred locale, with
unknown field provenance. An unchanged publisher name can have an inferred locale while
its name origin is `provided`. It does not imply translation or name generation.

`fields` is keyed by the actual localised field name, such as `name`, `brandName`,
`description` or `freeformAddress`. Each recorded field has an `origin`:

| Origin             | Meaning                                                      |
| ------------------ | ------------------------------------------------------------ |
| `provided`         | Explicit publisher or authored text.                         |
| `inferred`         | A field value derived through an inference or fallback rule. |
| `ai-translated`    | A machine-produced translation.                              |
| `human-translated` | A human-produced translation.                                |

`isHumanVerified` describes review of the current value independently of its origin.
Human review of an unchanged machine translation retains `ai-translated` origin.
Omission means verification is unknown; `false` explicitly records an unverified value.
`translatorId` identifies the human or service that produced a translation. It does not
identify its reviewer. These attributes are optional and must be grounded in retained
evidence.

An omitted field entry means its origin is unknown. It never implies publisher text,
human verification or translation. Metadata with no remaining information is stored as
SQL NULL in relational rows and JSON null inside locale values. Empty `fields` objects
are omitted. Producers record known field origins explicitly. Runtime validation rejects
invalid origins, non-boolean flags and empty translator identities.

CURRENT and HISTORY both allow NULL metadata, including HISTORY upserts. Canonical
hashes and comparisons include metadata, so a change to origin, verification or
translator identity creates a new locale version even when its text is identical. JSON
key ordering must not create a content revision.

The physical storage choice remains independent of this contract. Relational locale rows
retain their locale/name indexes and independent history. Nested JSON values are
versioned with their owning record. Address3D API localisations contain `meta` alongside
`units`, whose keys identify units within that locale.

C&SD curation inputs retain their detailed source `origin` evidence and review flag. The
canonical localisation rule projects that evidence into `meta.fields` for name and
description. Publisher and authored origins map to `provided`; machine and human
translations remain distinct. Missing source origin evidence remains unrecorded.

The representation backfill removes explicit false locale-inference flags without
reconstructing provenance or issuing new revisions. It preserves IDs, retained version
hashes and all recorded origins, verification flags and translator identities.
