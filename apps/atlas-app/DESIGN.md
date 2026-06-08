The design tokens for the `saanseoi` theme live in `src/routes/app.css` inside the Tailwind `@theme saanseoi` block. This brief keeps the brand intent and component reasoning only.

## Brand & Style
The design system is anchored in the concept of "The Digital Commons." It rejects the friction-heavy, attention-seeking patterns of modern SaaS in favor of an editorial, institutional aesthetic that feels like a cross between a contemporary art museum and an urban planning archive. It is designed for the "humane technologist"—someone who values data-driven insight but demands a soulful, culturally-rooted presentation.

The visual style is **Modernist Editorial**. It prioritizes high-contrast legibility, purposeful whitespace, and a structural grid inspired by architectural blueprints. By utilizing an eggshell foundation rather than pure white, the system achieves a "paper-like" quality that feels archival and permanent. The emotional response should be one of quiet authority, civic responsibility, and progressive optimism.

## Colors
The palette is rooted in the "Ink and Earth" philosophy. The primary surface is **Eggshell**, providing a warm, non-glare canvas that differentiates the product from sterile "tech" whites.

- **Ink:** Used for primary typography and structural borders. It is a soft black that mimics printed pigment.
- **Jade Green:** The secondary color, representing the intersection of nature and urban life. Used for success states, active navigational elements, and growth-related data.
- **Terracotta:** The tertiary color, inspired by historic masonry. Used for highlights, calls to action, and points of tension or urgency.
- **Muted Stone:** A neutral gray used for secondary meta-data and decorative rules to maintain a low-noise environment.

## Typography
Typography is the primary vehicle for the brand’s "Urbanist" identity. We use a pairing of two distinct personalities:

1. **Bricolage Grotesque (Display/Headlines):** A characterful, expressive typeface with quirky historical references. It provides the "progressive culture" edge, making headings feel like urban signage or editorial mastheads.
2. **Plus Jakarta Sans (UI/Body):** A modern, soft, and highly legible sans-serif. It handles the functional heavy lifting, ensuring that complex data remains approachable and easy to digest.

**Usage Rules:**
- All labels and navigation items must be in **Plus Jakarta Sans** with a slightly increased letter spacing for clarity.
- **Bricolage Grotesque** should never be used for body text; it is reserved for capturing attention and establishing hierarchy.
- Use **Optical Kerning** for large display titles to ensure the characterful ligatures feel intentional.

## Layout & Spacing
The layout follows a **Fixed-Column Modernist Grid**. This system prioritizes vertical rhythm and massive horizontal margins to simulate the feel of a high-end broadsheet or architectural report.

- **Desktop (1440px+):** A 12-column grid with a 1280px max-width container. Gutters are generous (32px) to prevent data density from feeling overwhelming.
- **Tablet:** 8-column grid with 24px gutters.
- **Mobile:** 4-column grid with 20px margins.

The "Stack" philosophy governs vertical spacing. Use `stack-lg` to separate distinct thematic sections, `stack-md` for component grouping, and `stack-sm` for internal element relationship. The goal is to maximize whitespace to allow the eggshell background to "breathe."

## Elevation & Depth
This design system avoids traditional drop shadows and neomorphic blurs to maintain its "Public Institution" feel. Instead, it utilizes **Tonal Layering and Ink Borders**.

- **Surface Levels:**
  - Level 0: The Base (Eggshell).
  - Level 1: Sub-containers (A slightly darker tint or a 1px border of Ink at 10% opacity).
  - Level 2: Interactive elements (Flat color fills or high-contrast strokes).
- **Depth through Borders:** Instead of a shadow, an "active" card or modal should use a 2px solid **Ink** border. This provides a crisp, graphic separation that feels more like a physical drawing than a digital layer.
- **Backdrop Blurs:** Reserved strictly for global navigation bars to maintain context of the scroll, using a high-diffusion blur with no tint.

## Shapes
Shapes are disciplined and architectural. We use the **Soft (0.25rem)** setting for the majority of UI components to strike a balance between clinical precision (sharp) and consumer playfulness (pill-shaped).

- **Standard Elements:** 4px radius (Buttons, Input fields, Chips).
- **Large Containers:** 8px radius (Cards, Modals).
- **Iconography:** Use a consistent 1.5pt stroke weight with slightly rounded terminals to match the font geometry of Plus Jakarta Sans.

## Components
Consistent component styling reinforces the "Commons" aesthetic:

- **Buttons:**
  - *Primary:* Solid Ink background with Eggshell text. No roundedness beyond 4px.
  - *Secondary:* 1.5px Ink border, transparent background.
  - *Accent:* Solid Jade Green or Terracotta for high-priority cultural actions.
- **Input Fields:** No background fill. Instead, use a 1px bottom-border only (Ink @ 30%) to mimic a paper form. Upon focus, transition to a solid 1px border around the entire element.
- **Chips/Tags:** Use the Jade Green or Terracotta at 10% opacity for the background with full-opacity text for a "printed ink" look.
- **Cards:** No shadows. Use a subtle 1px border (Ink at 15% opacity) and maximize internal padding (at least 24px) to ensure content never feels cramped.
- **Data Visuals:** Hong Kong-specific data should be visualized using geometric, clean-line charts in Jade and Ink, avoiding overly-vibrant "dashboard" colors.
- **Lists:** Separate items with a thin 0.5px horizontal rule. Use `label-md` for list headers to provide a clear, institutional hierarchy.
