The design tokens for the `saanseoi` theme live in `src/routes/app.css` inside the
Tailwind `@theme saanseoi` block. This brief keeps the brand intent and component
reasoning only.

## Brand & Style

The design system is anchored in the concept of "The Digital Commons." It rejects the
friction-heavy, attention-seeking patterns of modern SaaS in favour of an editorial,
institutional aesthetic that feels like a cross between a contemporary art museum and an
urban planning archive. It is designed for the "humane technologist"—someone who values
data-driven insight but demands a soulful, culturally-rooted presentation.

The visual style is **Modernist Editorial**. It prioritises high-contrast legibility,
purposeful whitespace, and a structural grid inspired by architectural blueprints. By
utilising an eggshell foundation rather than pure white, the system achieves a
"paper-like" quality that feels archival and permanent. The emotional response should be
one of quiet authority, civic responsibility, and progressive optimism.

## Colours

The palette is rooted in the "Ink and Earth" philosophy. The primary surface is
**Eggshell**, providing a warm, non-glare canvas that differentiates the product from
sterile "tech" whites.

- **Ink:** Used for primary typography and structural borders. It is a soft black that
  mimics printed pigment.
- **Jade Green:** The secondary colour, representing the intersection of nature and
  urban life. Used for success states, active navigational elements, and growth-related
  data.
- **Terracotta:** The tertiary colour, inspired by historic masonry. Used for
  highlights, calls to action, and points of tension or urgency.
- **Muted Stone:** A neutral grey used for secondary meta-data and decorative rules to
  maintain a low-noise environment.

### Semantic Data Palette

The Digital Commons data extension uses explicit semantic colours for marks, rules, and
small status surfaces. Large cards remain on the neutral data surfaces so the charts
stay quiet and architectural.

- **Success** `#10b981` — additions, healthy coverage, and positive movement.
- **Warning** `#f59e0b` — changed records and points of attention.
- **Error** `#ef4444` — removals and regressions.
- **Alert** `#dc2626` — quality issues requiring attention.
- **Neutral** `#6c7a71` — unchanged records and supporting rules.
- **Track** `#dde4dd` — the quiet background behind data bars.

Data surfaces use `#f4fbf4` as the base, `#eef6ee` for low containers, `#e8f0e9` for
containers, `#e3eae3` for high containers, `#dde4dd` for the highest container,
`#ffffff` for the lowest surface, and `#bbcabf` for outline variants. The corresponding
dark semantic foregrounds are Success `#34d399`, Warning `#fbbf24`, Error `#f87171`, and
Alert `#f87171`; dark data surfaces use deeper neutral containers.

Bar charts use solid fills without borders. Stacked bars use a 1px `Ink` divider between
segments in light mode and an Eggshell divider in dark mode. Keep semantic colours on
marks, rules, and compact status surfaces; use the neutral surface tokens for large
cards.

## Typography

Typography is the primary vehicle for the brand’s "Urbanist" identity. We use a pairing
of two distinct personalities:

1. **Bricolage Grotesque (Display/Headlines):** A characterful, expressive typeface with
   quirky historical references. It provides the "progressive culture" edge, making
   headings feel like urban signage or editorial mastheads.
2. **Plus Jakarta Sans (UI/Body):** A modern, soft, and highly legible sans-serif. It
   handles the functional heavy lifting, ensuring that complex data remains approachable
   and easy to digest.

**Usage Rules:**

- All labels and navigation items must be in **Plus Jakarta Sans** with a slightly
  increased letter spacing for clarity.
- **Bricolage Grotesque** should never be used for body text; it is reserved for
  capturing attention and establishing hierarchy.
- Use **Optical Kerning** for large display titles to ensure the characterful ligatures
  feel intentional.

## Layout & Spacing

The layout follows a **Fixed-Column Modernist Grid**. This system prioritises vertical
rhythm and massive horizontal margins to simulate the feel of a high-end broadsheet or
architectural report.

- **Desktop (1440px+):** A 12-column grid with a 1280px max-width container. Gutters are
  generous (32px) to prevent data density from feeling overwhelming.
- **Tablet:** 8-column grid with 24px gutters.
- **Mobile:** 4-column grid with 20px margins.

The "Stack" philosophy governs vertical spacing. Use `stack-lg` to separate distinct
thematic sections, `stack-md` for component grouping, and `stack-sm` for internal
element relationship. The goal is to maximise whitespace to allow the eggshell
background to "breathe."

## Elevation & Depth

This design system avoids traditional drop shadows and neomorphic blurs to maintain its
"Public Institution" feel. Instead, it utilises **Tonal Layering and Ink Borders**.

- **Surface Levels:**
  - Level 0: The Base (Eggshell).
  - Level 1: Sub-containers (A slightly darker tint or a 1px border of Ink at 10%
    opacity).
  - Level 2: Interactive elements (Flat colour fills or high-contrast strokes).
- **Depth through Borders:** Instead of a shadow, an "active" card or modal should use a
  2px solid **Ink** border. This provides a crisp, graphic separation that feels more
  like a physical drawing than a digital layer.
- **Backdrop Blurs:** Reserved strictly for global navigation bars to maintain context
  of the scroll, using a high-diffusion blur with no tint.

## Shapes

Shapes are disciplined and architectural. We use the **Soft (0.25rem)** setting for the
majority of UI components to strike a balance between clinical precision (sharp) and
consumer playfulness (pill-shaped).

- **Standard Elements:** 4px radius (Buttons, Input fields, Chips).
- **Large Containers:** 8px radius (Cards, Modals).
- **Iconography:** Use a consistent 1.5pt stroke weight with slightly rounded terminals
  to match the font geometry of Plus Jakarta Sans.

## Components

Consistent component styling reinforces the "Commons" aesthetic:

- **Buttons:**
  - _Primary:_ Solid Ink background with Eggshell text. No roundedness beyond 4px.
  - _Secondary:_ 1.5px Ink border, transparent background.
  - _Accent:_ Solid Jade Green or Terracotta for high-priority cultural actions.
- **Input Fields:** No background fill. Instead, use a 1px bottom-border only (Ink @
  30%) to mimic a paper form. Upon focus, transition to a solid 1px border around the
  entire element.
- **Chips/Tags:** Use the Jade Green or Terracotta at 10% opacity for the background
  with full-opacity text for a "printed ink" look.
- **Cards:** No shadows. Use a subtle 1px border (Ink at 15% opacity) and maximise
  internal padding (at least 24px) to ensure content never feels cramped.
- **Data Visuals:** Hong Kong-specific data should be visualised using geometric,
  clean-line charts in Jade and Ink, avoiding overly-vibrant "dashboard" colours.
- **Lists:** Separate items with a thin 0.5px horizontal rule. Use `label-md` for list
  headers to provide a clear, institutional hierarchy.
