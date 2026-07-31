<script lang="ts">
/** Locally bundled icon paths; language uses Ionicons because ProIcons has no equivalent. */
export type IconName =
  | 'checkmark'
  | 'chevron-down'
  | 'color-palette'
  | 'language'
  | 'layers'
  | 'target'
  | 'info'

let { name, class: className = '' }: { name: IconName; class?: string } = $props()
</script>

<svg
  aria-hidden="true"
  class={className}
  viewBox={name === "language" ? "0 0 512 512" : "0 0 24 24"}
>
  {#if name === "layers"}
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
  {:else if name === "chevron-down"}
    <path
      fill="none"
      stroke="currentColor"
      stroke-linecap="round"
      stroke-linejoin="round"
      stroke-width="1.5"
      d="m4.75 9.75l6.19 6.19a1.5 1.5 0 0 0 2.12 0l6.19-6.19"
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
