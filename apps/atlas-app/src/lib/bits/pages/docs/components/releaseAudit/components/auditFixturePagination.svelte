<script lang="ts">
import { AUDIT_FIXTURE_PAGE_SIZE as pageSize } from '@repo/core/provenance/auditFixturePagination'

let {
  offset = $bindable(0),
  count,
}: {
  offset?: number
  count: number
} = $props()
</script>

<nav
  class="flex items-center justify-between gap-3 py-3 text-sm"
  aria-label="Evidence pages"
>
  <button
    type="button"
    class="underline disabled:opacity-40"
    disabled={offset === 0}
    onclick={() => (offset = Math.max(0, offset - pageSize))}
  >
    Previous
  </button>
  <span
    >{Math.min(offset + 1, count).toLocaleString()}–{Math.min(
      offset + pageSize,
      count,
    ).toLocaleString()}
    / {count.toLocaleString()}</span
  >
  <button
    type="button"
    class="underline disabled:opacity-40"
    disabled={offset + pageSize >= count}
    onclick={() => (offset += pageSize)}
  >
    Next
  </button>
</nav>
