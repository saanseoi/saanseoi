# canonical division types

The `division-normalisation.json` processing fixture owns subtype/class mappings,
hierarchy classifications, ordered level tokens, Hong Kong area-name recognition and
fallbacks. The normaliser consumes these parameters directly. Level-token order and
substring matching are significant; review both when editing taxonomy policy.

The retained declaration includes the executor's ordered condition trees and stable
branch IDs. Level-token branches distinguish subtype, class and administrative-level
matches. Locality mappings are counted separately for level and type; type fallback does
not count its supporting level lookup a second time. Bulk matched counts count only
selected branches, and changed counts compare canonical results with raw source `level`
and `type` values. Unselected branches retain zeroes. Missing historical conditions or
counts remain **not recorded**.

Local division ingestion reports provenance retention and delivery after SQL generation.
Shared audit fixtures use a bounded cache of verified JSON objects during verification;
each individual curation pointer is checked before the audit manifest is retained.

## v1

### EN

<black>filter[divisionType]</black> matches one canonical type exactly. It does not
accept an Overture subtype or class. The types are:

- Root: <black>country</black> and <black>sar</black>.
- Level 1: <black>area</black>.
- Level 2: <black>district</black>.
- Level 3: <black>town</black>.
- Level 4: <black>macrohood</black>.
- Level 5: <black>neighbourhood</black> and <black>village</black>.
- Level 6: <black>microhood</black> and <black>hamlet</black>.

### ZH-HANT

<black>filter[divisionType]</black>
會完全比對一個標準類型，並不接受 Overture 的 subtype 或 class。可用類型如下：

- 根節點：<black>country</black> 及 <black>sar</black>。
- Level 1：<black>area</black>。
- Level 2：<black>district</black>。
- Level 3：<black>town</black>。
- Level 4：<black>macrohood</black>。
- Level 5：<black>neighbourhood</black> 及 <black>village</black>。
- Level 6：<black>microhood</black> 及 <black>hamlet</black>。

### ZH-HANS

<black>filter[divisionType]</black>
会完全匹配一个标准类型，并不接受 Overture 的 subtype 或 class。可用类型如下：

- 根节点：<black>country</black> 及 <black>sar</black>。
- Level 1：<black>area</black>。
- Level 2：<black>district</black>。
- Level 3：<black>town</black>。
- Level 4：<black>macrohood</black>。
- Level 5：<black>neighbourhood</black> 及 <black>village</black>。
- Level 6：<black>microhood</black> 及 <black>hamlet</black>。
