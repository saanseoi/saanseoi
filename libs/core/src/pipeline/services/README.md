# Pipeline services

Services implement processing behaviour above `pipeline/db`, which owns database access.
Import the module responsible for the operation directly.

Each directory has a public entry point, so package consumers can depend on a domain
without knowing its internal file layout. For example:

```ts
import { normaliseOverturePlace } from "@repo/core/pipeline/services/places";
import { parseWkbGeometry } from "@repo/core/pipeline/services/divisions";
```

| Path          | Responsibility                                                                                                 |
| ------------- | -------------------------------------------------------------------------------------------------------------- |
| `addresses/`  | Address normalisation, corrections and staged source/current/history/SQL processing.                           |
| `divisions/`  | Division and geometry processing, hierarchy, classification, localisation and reviewed geographic restoration. |
| `places/`     | Place normalisation, localisation and address assembly.                                                        |
| `sources/`    | Publisher payload storage mappings, acquisition references and retained-payload rewrites.                      |
| `statistics/` | Statistical observation rules and reference-period interpretation.                                             |
| `metrics/`    | Release and API snapshot counts, quality, churn, coverage and geometry summaries.                              |
| `storage/`    | JSON compression and intermediate pipeline artefact storage.                                                   |
| `runtime.ts`  | Environment selection, debug configuration, operation timing and memory diagnostics.                           |

Keep family-specific policy with its family. Source storage mappings preserve publisher
evidence; canonical corrections belong in family processing. Release metrics describe
processing results, while statistical rules interpret dataset observations. Storage and
runtime helpers must not acquire family policy.

Keep tests beside their modules. Update repository callers when moving a module; the
package's `pipeline/*` export exposes these paths directly.
