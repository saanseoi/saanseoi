# AGENTS.md

App-local operating notes for `apps/atlas-app`.

## Styling

- Use Tailwind utility classes inline in Svelte markup for all component styling.
- Do not add component-specific CSS, scoped styles, or global utility wrappers for visual styling.
- The only styling exception is the shared Tailwind theme definition in `src/routes/app.css`, which must remain the single source of truth for the `saanseoi` design tokens.
- When new visual tokens are introduced, add them to the `@theme saanseoi` block first, then consume them from inline Tailwind classes.

## Design System

- `DESIGN.md` should retain brand reasoning, layout rationale, and component guidance, but not duplicate raw token definitions.

## Components

- Prefer published `bits-ui` components and primitives.
- If a component does not exist in `bits-ui`, build a local component with a similar API shape, composition style, and code structure to published Bits UI components.
- Style Bits UI components via inline Tailwind classes and component props, consistent with the Bits UI styling guidance: `https://bits-ui.com/docs/styling/llms.txt`.

## Icons

- Use ProIcons via `@iconify/svelte` for interface icons in this app.
