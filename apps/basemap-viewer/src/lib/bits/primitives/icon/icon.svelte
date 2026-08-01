<script lang="ts">
/** Locally bundled icon paths; language uses Ionicons because ProIcons has no equivalent. */
export type IconName =
  | 'checkmark'
  | 'chevron-down'
  | 'close'
  | 'copy'
  | 'color-palette'
  | 'fullscreen'
  | 'identify'
  | 'language'
  | 'layers'
  | 'menu'
  | 'debug'
  | 'target'
  | 'info'

let { name, class: className = '' }: { name: IconName; class?: string } = $props()
</script>

<svg
  aria-hidden="true"
  class={className}
  viewBox={name === "language" ? "0 0 512 512" : name === "identify" ? "0 0 32 32" : "0 0 24 24"}
>
  {#if name === "menu"}
    <path
      fill="none"
      stroke="currentColor"
      stroke-linecap="round"
      stroke-width="1.5"
      d="M4 7.25h16M4 12h16M4 16.75h16"
    />
  {:else if name === "layers"}
    <g fill="none" stroke="currentColor" stroke-linejoin="round" stroke-width="1.5">
      <path
        d="M12.991 3.066a2 2 0 0 0-1.982 0L2.75 7.778l8.259 4.712a2 2 0 0 0 1.982 0l8.259-4.712z"
      />
      <path
        stroke-linecap="round"
        d="m2.75 12l7.268 4.147a4 4 0 0 0 3.964 0L21.25 12M2.75 16.222l7.268 4.147a4 4 0 0 0 3.964 0l7.268-4.147"
      />
    </g>
  {:else if name === "target"}
    <g fill="none">
      <circle cx="12" cy="12" r="9.25" stroke="currentColor" stroke-width="1.5" />
      <circle cx="12" cy="12" r="5.25" stroke="currentColor" stroke-width="1.5" />
      <circle cx="12" cy="12" r="2" fill="currentColor" />
    </g>
  {:else if name === "color-palette"}
    <g fill="none">
      <circle
        cx="1.25"
        cy="1.25"
        r="1.25"
        fill="currentColor"
        transform="matrix(-1 0 0 1 16.654 6.034)"
      />
      <circle
        cx="1.25"
        cy="1.25"
        r="1.25"
        fill="currentColor"
        transform="matrix(-1 0 0 1 12.156 5.221)"
      />
      <circle
        cx="1.25"
        cy="1.25"
        r="1.25"
        fill="currentColor"
        transform="matrix(-1 0 0 1 8.654 7.94)"
      />
      <circle
        cx="1.25"
        cy="1.25"
        r="1.25"
        fill="currentColor"
        transform="matrix(-1 0 0 1 7.685 12.156)"
      />
      <circle
        cx="1.25"
        cy="1.25"
        r="1.25"
        fill="currentColor"
        transform="matrix(-1 0 0 1 9.904 15.948)"
      />
      <path
        stroke="currentColor"
        stroke-linejoin="round"
        stroke-width="1.5"
        d="M21.25 12A9.25 9.25 0 1 0 12 21.25c1.318 0 2.224-1.28 2.329-2.594l.117-1.473a3 3 0 0 1 2.758-2.752l1.651-.129c1.28-.1 2.395-1.019 2.395-2.302Z"
      />
    </g>
  {:else if name === "language"}
    <path
      fill="none"
      stroke="currentColor"
      stroke-linecap="round"
      stroke-linejoin="round"
      stroke-width="32"
      d="M48 112h288M192 64v48m80 336l96-224l96 224m-162.5-64h133M281.3 112S257 206 199 277S80 384 80 384M256 336s-35-27-72-75s-56-85-56-85"
    />
  {:else if name === "identify"}
    <g>
      <path d="M0 0h32v32H0z" fill="none" />
      <path
        fill="currentColor"
        d="M15 8h2v6h-2zm0 10h2v6h-2zm3-3h6v2h-6zM8 15h6v2H8zm-4-5H2V4a2 2 0 0 1 2-2h6v2H4Zm6 20H4a2 2 0 0 1-2-2v-6h2v6h6Zm18 0h-6v-2h6v-6h2v6a2 2 0 0 1-2 2m2-20h-2V4h-6V2h6a2 2 0 0 1 2 2Z"
      />
    </g>
  {:else if name === "debug"}
    <path
      fill="none"
      stroke="currentColor"
      stroke-linecap="round"
      stroke-linejoin="round"
      stroke-width="1.5"
      d="M7.5 9.08a3.23 3.23 0 0 1 3.23-3.23h2.54a3.23 3.23 0 0 1 3.23 3.23v6.27a4.5 4.5 0 0 1-4.5 4.5v0a4.5 4.5 0 0 1-4.5-4.5zm9 3.77h4.75m-18.5 0H7.5m2.25-9.7v.45A2.25 2.25 0 0 0 12 5.85v0a2.25 2.25 0 0 0 2.25-2.25v-.45M16.5 16.6h1.253a2.5 2.5 0 0 1 2.5 2.5v1.75M7.5 16.6H6.247a2.5 2.5 0 0 0-2.5 2.5v1.75M16.5 9.1h1.253a2.5 2.5 0 0 0 2.5-2.5V4.85M7.5 9.1H6.247a2.5 2.5 0 0 1-2.5-2.5V4.85"
    />
  {:else if name === "chevron-down"}
    <path
      fill="none"
      stroke="currentColor"
      stroke-linecap="round"
      stroke-linejoin="round"
      stroke-width="1.5"
      d="m4.75 9.75l6.19 6.19a1.5 1.5 0 0 0 2.12 0l6.19-6.19"
    />
  {:else if name === "close"}
    <path
      fill="none"
      stroke="currentColor"
      stroke-linecap="round"
      stroke-width="1.5"
      d="m6.75 6.75l10.5 10.5m0-10.5l-10.5 10.5"
    />
  {:else if name === "copy"}
    <g fill="none" stroke="currentColor" stroke-linejoin="round" stroke-width="1.5">
      <rect x="8.25" y="8.25" width="11.25" height="11.25" rx="1.75" />
      <path
        stroke-linecap="round"
        d="M15.75 8.25V6.5a1.75 1.75 0 0 0-1.75-1.75H6.5A1.75 1.75 0 0 0 4.75 6.5v7.5a1.75 1.75 0 0 0 1.75 1.75h1.75"
      />
    </g>
  {:else if name === "fullscreen"}
    <path
      fill="none"
      stroke="currentColor"
      stroke-linecap="round"
      stroke-linejoin="round"
      stroke-width="1.5"
      d="M4.5 9V4.5H9M15 4.5h4.5V9M19.5 15v4.5H15M9 19.5H4.5V15"
    />
  {:else if name === "info"}
    <g fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.5">
      <circle cx="12" cy="12" r="9.25" />
      <path d="M12 10.5v5M12 7.5h.01" />
    </g>
  {:else}
    <path
      fill="none"
      stroke="currentColor"
      stroke-linecap="round"
      stroke-linejoin="round"
      stroke-width="1.5"
      d="m19.75 7.018l-9.257 9.257a1 1 0 0 1-1.414 0L4.25 11.446"
    />
  {/if}
</svg>
