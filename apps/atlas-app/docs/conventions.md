# Conventions and Structure

## Components

We use BitsUI for our components.

| Rule                                                      | Rationale                                              |
| --------------------------------------------------------- | ------------------------------------------------------ |
| **Primitives never import components**                    | Prevents circular deps, keeps atomic layer pure        |
| **Components can import primitives + other components**   | Composition flows upward                               |
| **Patterns import components, never primitives directly** | Forces consistency through component layer             |
| **Pages group route-specific sections**                   | Keeps route composition reusable without polluting app-wide patterns |
| **Variants live inside their component**                  | A variant of Combobox is still a Combobox concern      |
| **`index.ts` is the only public contract**                | Lets you refactor internals without breaking consumers |

With the following structure:

```
lib/bits/
├── primitives/          # Atomic, indivisible elements (Button, Input, Label)
│   ├── button/
│   ├── input/
│   ├── label/
│   └── ...
│
├── components/          # Composed primitives + logic (Combobox, Dialog, Tabs)
│   ├── combobox/
│   │   ├── primitives/  # Internal pieces users shouldn't import directly
│   │   │   ├── trigger.svelte
│   │   │   ├── content.svelte
│   │   │   └── item.svelte
│   │   ├── variants/    # Pre-styled combinations
│   │   │   ├── simple.svelte
│   │   │   └── multi-select.svelte
│   │   └── index.ts     # Public API: exports the composed component
│   │
│   └── dialog/
│       ├── primitives/
│       ├── variants/
│       └── index.ts
│
├── patterns/            # Domain-specific compositions (ProductCard, CommentThread)
│   ├── checkout-flow/
│   └── data-table/
│
├── pages/               # Route-specific sections/compositions used by Svelte pages
│   ├── landing/
│   │   ├── hero.svelte
│   │   ├── foundation-grid.svelte
│   │   ├── showcase.svelte
│   │   └── newsletter.svelte
│   └── ...
│
├── utilities/           # Helpers that aren't components
│   ├── transitions/     # Shared Svelte transitions
│   ├── actions/         # Svelte actions (clickOutside, portal, etc.)
│   └── helpers/         # Pure functions (cn(), generateId, etc.)
│
├── internal/            # Framework glue (context keys, constants)
│   ├── context.ts
│   └── types.ts
│
└── index.ts             # Public barrel export
```

Note that:

- `utilities/` — Shared non-component code. bitsUI components often need:
  - Transition presets (fade, slide, scale combos)
  - Svelte actions (focus trap, portal, click-outside)
  - Class merging (cn() from clsx + tailwind-merge)

- `internal/` — Cross-cutting concerns that aren't public API:
  - Shared TypeScript types
  - Context keys (symbols for Svelte context)
  - Constants (ARIA defaults, keyboard shortcuts)

## Pages

We use `pages/` for route-scoped UI that is larger than a reusable component or pattern, but still worth splitting into named sections.

Current example:

- `src/routes/+page.svelte` composes the landing page from `bits/pages/landing/*`
- Each file in `pages/landing/` renders one section: hero, foundation grid, showcase, newsletter
- These sections can import primitives, components, assets, and internal helpers directly when the composition is specific to that route

Use `pages/` when:

- The UI is specific to a single route or a small route family
- The unit is a page section, not a globally reusable product pattern
- Splitting the route into named sections improves readability and maintenance

Avoid using `pages/` when:

- The UI is generic enough to live in `components/`
- The UI represents a domain pattern that should be shared across multiple screens
- The file is just a tiny wrapper with no meaningful page-level composition

Practical boundary:

- Routes assemble sections from `pages/`
- `pages/` sections assemble lower-level bits and route-specific content
- If a `pages/` section becomes reusable across unrelated routes, promote it into `patterns/` or `components/`
