# Component Architecture

This document defines the UI layering model for Atlas bits and how logic is distributed.
It adapts the shared Hype component guidelines to this app's existing Svelte and Bits UI
conventions.

## Layering

1. `src/lib/bits/primitives/{componentType}/`
   - Lowest-level, reusable UI elements.
   - Wrap or compose official Bits UI primitives where appropriate.
   - Do not depend on application or route data.

2. `src/lib/bits/components/{componentType}/`
   - Reusable Atlas components composed from primitives.
   - Expose their public API exclusively through `index.ts`.
   - Keep domain and route concerns out of this layer.

3. `src/lib/bits/patterns/{patternType}/`
   - Domain-specific, reusable combinations of components.
   - May contain UI behaviour and conditional rendering, but remain as context-agnostic
     as practical.

4. `src/lib/bits/pages/{routeFamily}/`
   - Route-scoped page sections and their local component hierarchies.
   - May import route-specific data, i18n, and lower-level Bits directly.
   - Promote a section to `patterns/` or `components/` only when it becomes useful
     outside its route family.

5. `+page.svelte` and `+layout.svelte`
   - Consumption boundary for route wiring, page-level state, and side effects.
   - Compose page sections; do not reach into their internal implementation files.

## Landing Section Hierarchy

A landing-section entry file is a small composition only. It imports the local namespace
and combines explicit parts:

```svelte
<FeatureSection.Root>
  <FeatureSection.Content />
</FeatureSection.Root>
```

The namespace is the public API for its local hierarchy. The root owns the semantic
section wrapper, supports `children` and `class`, and owns wrapper-level styling. Named
child components own their focused content and local interaction state.

```text
pages/landing/
├── featureSection.svelte
└── components/
    └── featureSection/
        ├── featureSectionRoot.svelte
        ├── featureSectionContent.svelte
        └── index.ts
```

Use meaningful child names instead of generic names such as `section.svelte`:

- `FoundationSection.Map`
- `CommunitySection.Newsletter`
- `PipelineSection.Flow`

## Composition and State

- Prefer namespaced composition: `<Component.Root>` and `<Component.Part>`.
- Keep local visual interaction and accessibility handlers in the part that renders the
  UI.
- Keep route/domain mutations, async orchestration, and page-to-page wiring in the route
  or a route adapter.
- Prefer controlled or bindable props when a reusable component needs state from its
  consumer.
- Use context only for a genuine local component contract, not to hide page-level state
  ownership.

## Naming and Public Contracts

- Component folders use `camelCase`.
- Atlas currently uses `camelCase` Svelte filenames. Prefix leaf filenames with their
  component folder so file pickers and jump-to-file remain unambiguous:
  `communitySectionRoot.svelte`, not `root.svelte`.
- Non-component modules use `camelCase`.
- `index.ts` is the only public contract for a local component hierarchy.
- A top-level page-section file may import its own local `components/` index, but
  consumers outside that folder should use the section entry file or the namespace
  deliberately.

## Styling

- Prefer inline utility classes for local styling.
- Keep semantic classes only for cross-part styling, CSS variables, animation states, or
  styling that cannot be expressed cleanly with utilities.
- Keep shared wrapper styling with the root component; keep part-specific styling with
  the part when it does not need to cross component boundaries.
- Do not introduce a wrapper solely to mirror a set of utility classes.
