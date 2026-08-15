<script lang="ts">
import { m } from '$lib/bits/internal/i18n'
import type {
  ReleaseNavDomain,
  ReleaseNavOutlineItem,
  ReleaseNavVersion,
} from '../releaseNav.types'
import ReleaseNavDomainList from './releaseNavDomainList.svelte'
import ReleaseNavOutline from './releaseNavOutline.svelte'
import ReleaseNavVersionList from './releaseNavVersionList.svelte'

type Props = {
  activeOutlineId: string | null
  canExpand?: boolean
  currentDomainCode?: string
  currentVersionCode: string
  domains?: ReleaseNavDomain[]
  domainTitle?: string
  outline?: ReleaseNavOutlineItem[]
  panel?: HTMLElement
  versions: ReleaseNavVersion[]
}
let {
  activeOutlineId,
  canExpand = true,
  currentDomainCode,
  currentVersionCode,
  domains = [],
  domainTitle = 'Domains',
  outline = [],
  panel,
  versions,
}: Props = $props()
</script>

{#snippet domainList()}
  <ReleaseNavDomainList {currentDomainCode} {domains} title={domainTitle} />
{/snippet}

<aside class="h-full">
  <ReleaseNavVersionList
    {canExpand}
    {currentVersionCode}
    footer={domainList}
    {versions}
  >
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
