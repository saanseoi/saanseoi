<script lang="ts">
import { getLocale } from '@repo/i18n/runtime'
import { getDistrictGeometryNames } from '#lib/registry/district.remote.js'
let { ids }: { ids: string[] } = $props()
let names = $derived(
  getDistrictGeometryNames({ districtIds: ids, locale: getLocale() }),
)
</script>

<ul class="space-y-1">
  {#each ids as id}
    <li>
      <span title={id}
        >{names.ready ? names.current.find(row => row.divisionId === id)?.name ?? id : id}</span
      >
    </li>
  {/each}
</ul>
