<script lang="ts">
import { m } from '$lib/bits/internal/i18n'
import type { ReleaseNavOutlineItem, ReleaseNavVersion } from '../releaseNav.types'
import ReleaseNavOutline from './releaseNavOutline.svelte'
import ReleaseNavVersionList from './releaseNavVersionList.svelte'

type Props = {
  activeOutlineId: string | null
  canExpand?: boolean
  currentVersionCode: string
  outline?: ReleaseNavOutlineItem[]
  panel?: HTMLElement
  versions: ReleaseNavVersion[]
}
let {
  activeOutlineId,
  canExpand = true,
  currentVersionCode,
  outline = [],
  panel,
  versions,
}: Props = $props()
</script>

<aside class="h-full">
  <ReleaseNavVersionList {canExpand} {currentVersionCode} {versions}>
    {#if outline.length}
      <ReleaseNavOutline
        activeId={activeOutlineId}
        ariaLabel={m.source_release_sections()}
        items={outline}
        {panel}
      />
    {/if}
  </ReleaseNavVersionList>
</aside>
