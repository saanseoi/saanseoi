<script lang="ts">
import { m } from '#lib/bits/internal/i18n.js'
import type {
  ReleaseNavDomain,
  ReleaseNavOutlineItem,
  ReleaseNavVersion,
  ReleaseNavVersionPreload,
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
  loading?: boolean
  outline?: ReleaseNavOutlineItem[]
  panel?: HTMLElement
  onVersionPreload?: ReleaseNavVersionPreload
  versions: ReleaseNavVersion[]
}
let {
  activeOutlineId,
  canExpand = true,
  currentDomainCode,
  currentVersionCode,
  domains = [],
  domainTitle = 'Domains',
  loading = false,
  outline = [],
  panel,
  onVersionPreload,
  versions,
}: Props = $props()
</script>

{#snippet domainList()}
  <ReleaseNavDomainList {currentDomainCode} {domains} title={domainTitle} />
{/snippet}

<aside class="h-full">
  <div
    class={`grid h-full min-h-0 ${domains.length ? 'grid-rows-[var(--release-version-height,1fr)_minmax(0,1fr)]' : 'grid-rows-[minmax(0,1fr)]'}`}
  >
    <ReleaseNavVersionList
      {canExpand}
      {currentVersionCode}
      {loading}
      {onVersionPreload}
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
    {@render domainList()}
  </div>
</aside>
