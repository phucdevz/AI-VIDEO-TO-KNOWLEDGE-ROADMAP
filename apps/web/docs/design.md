# Design System Strategy: The Intelligent Ether

## 1. Overview & Creative North Star
The Creative North Star for this design system is **"The Intelligent Ether."** 

Unlike traditional learning platforms that feel like digital textbooks, this system treats the interface as a living, breathing cognitive space. We move beyond "clean" into "ethereal"—where the AI doesn't just sit on the page but radiates through it. We break the standard rigid grid through **intentional asymmetry** and **tonal layering**, creating a high-end editorial feel that mimics a premium scientific journal crossed with a futuristic HUD. 

The experience must feel weightless yet authoritative. We achieve this by prioritizing white space (breathing room) over structural lines and using the Electric Violet primary as a "pulse" that guides the user's eye toward progress and interaction.

---

## 2. Colors & Surface Logic
Our palette is rooted in high-contrast clarity and sophisticated depth. We move away from flat UI by treating every surface as a layer of light.

### The "No-Line" Rule
**Explicit Instruction:** Do not use 1px solid borders to section content. Boundaries must be defined strictly through background color shifts.
*   **Example:** A `surface-container-low` (#eff1f2) card should sit on a `surface` (#f5f6f7) background. The transition in hex value provides all the definition needed.

### Surface Hierarchy & Nesting
Treat the UI as a series of stacked, frosted layers. 
*   **Base Layer:** `surface` (#f5f6f7).
*   **Primary Containers:** Use `surface-container-lowest` (#ffffff) for the most important content cards to create a "lifted" appearance.
*   **Secondary Content:** Use `surface-container` (#e6e8ea) or `surface-container-high` (#e0e3e4) for utility bars or secondary modules.

### The "Glass & Gradient" Rule
To evoke a high-tech AI feel, use **Glassmorphism** for floating elements (modals, dropdowns). 
*   **Token:** Use `surface` at 80% opacity with a `20px` backdrop-blur.
*   **Signature Gradient:** For primary actions, use a linear gradient: `primary` (#6a37d4) to `primary_container` (#ae8dff) at a 135-degree angle. This provides a "soul" to the UI that a flat hex code cannot achieve.

**Implementation:** Tailwind color tokens live in [`packages/design-tokens/tailwind-preset.cjs`](../../../packages/design-tokens/tailwind-preset.cjs). Shared utilities (`.ether-gradient`, `.glass-panel`, etc.) are in [`apps/web/src/index.css`](../src/index.css).

---

## 3. Typography: Editorial Authority
We use **Inter** as our sole typeface, relying on extreme scale and weight contrast rather than multiple fonts to create hierarchy.

*   **Display Scale:** Use `display-lg` (3.5rem) for hero AI prompts. It should be semi-bold with tight letter-spacing (-0.02em) to feel like a high-end headline.
*   **The Power of Labels:** Use `label-md` (0.75rem) in all-caps with increased letter-spacing (0.1em) for category tags. This injects a "technical/data" aesthetic into the editorial layout.
*   **Body Copy:** `body-lg` (1rem) is the anchor. Maintain a line-height of 1.6 to ensure the "Ether" feels airy and readable during long learning sessions.

---

## 4. Elevation & Depth: Tonal Layering
Traditional drop shadows are too "heavy" for a modern AI platform. We use **Ambient Shadows** and **Tonal Lift**.

*   **The Layering Principle:** Stack `surface-container-lowest` on `surface-container-low`. The 1-2% shift in brightness creates a soft, natural lift.
*   **Ambient Shadows:** When a shadow is required (e.g., a floating AI assistant button), use a diffused blur:
    *   `box-shadow: 0 20px 40px rgba(106, 55, 212, 0.08);` (Note the purple tint in the shadow—this mimics natural light passing through a violet primary element).
*   **The "Ghost Border" Fallback:** If a border is required for accessibility, use the `outline_variant` (#abadae) at **15% opacity**. Never use 100% opaque borders.

---

## 5. Component Guidelines

### Buttons (High-Contrast High-Tech)
*   **Primary:** Linear gradient (`primary` to `primary_container`). Border-radius: `md` (0.75rem). No shadow, but a subtle inner glow (1px white at 10% opacity) on the top edge.
*   **Secondary:** Ghost style. Transparent background with a `Ghost Border`. Text color: `on_surface`.
*   **Social Logins:** `surface-container-lowest` background. Use `label-md` for the text. Minimalism is key—no borders.

### Minimal Form Inputs
*   **Resting State:** `surface-container-high` (#e0e3e4) background, no border, 0.75rem radius.
*   **Focus State:** Background shifts to `surface-container-lowest` (#ffffff) with a 2px `primary` glow.
*   **Floating Labels:** Labels should use `label-sm` and be positioned 8px above the input field, never inside it, to maintain a "technical blueprint" look.

### Cards & Lists (The No-Divider Rule)
*   **Forbidden:** 1px horizontal dividers between list items.
*   **Alternative:** Use `spacing-4` (1rem) of vertical white space or alternate background colors between `surface` and `surface-container-low`.

### AI Feedback Chips
*   Interactive chips for AI suggestions should use `primary_container` (#ae8dff) with `on_primary_container` (#2b006e) text. Use `full` (9999px) roundedness for a pill shape.

---

## 6. Do's and Don'ts

### Do:
*   **Embrace Asymmetry:** Align text to the left while keeping imagery or interactive AI modules offset to the right to create a dynamic, modern flow.
*   **Use the Spacing Scale:** Stick strictly to the increments (4, 8, 12, 16). Precision is what makes "clean" look "professional."
*   **Primary Tinting:** Use `surface_tint` (#6a37d4) at very low opacities (2-3%) over white sections to keep the brand's "Electric Violet" energy present throughout.

### Don't:
*   **Don't use pure black:** Use `on_surface` (#2c2f30) for text. Pure #000000 is too jarring and vibrates against the violet gradient.
*   **Don't over-round:** Stick to the `md` (0.75rem) or `lg` (1rem) tokens. Going too round (2rem+) makes the platform look like a toy; staying too sharp (0px) makes it look like an old enterprise tool.
*   **Don't clutter:** If an element isn't teaching the user or providing AI value, remove it. The "Ether" requires space to function.
