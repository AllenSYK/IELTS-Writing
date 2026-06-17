---
name: Aura Liquid Glass
colors:
  surface: '#f9f9ff'
  surface-dim: '#d8d9e5'
  surface-bright: '#f9f9ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f1f3fe'
  surface-container: '#ecedf9'
  surface-container-high: '#e6e8f3'
  surface-container-highest: '#e0e2ed'
  on-surface: '#181c23'
  on-surface-variant: '#414755'
  inverse-surface: '#2d3039'
  inverse-on-surface: '#eef0fc'
  outline: '#717786'
  outline-variant: '#c1c6d7'
  surface-tint: '#005bc1'
  primary: '#0058bc'
  on-primary: '#ffffff'
  primary-container: '#0070eb'
  on-primary-container: '#fefcff'
  inverse-primary: '#adc6ff'
  secondary: '#5d5e63'
  on-secondary: '#ffffff'
  secondary-container: '#e0dfe4'
  on-secondary-container: '#626267'
  tertiary: '#845000'
  on-tertiary: '#ffffff'
  tertiary-container: '#a66600'
  on-tertiary-container: '#fffbff'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#d8e2ff'
  primary-fixed-dim: '#adc6ff'
  on-primary-fixed: '#001a41'
  on-primary-fixed-variant: '#004493'
  secondary-fixed: '#e3e2e7'
  secondary-fixed-dim: '#c6c6cb'
  on-secondary-fixed: '#1a1b1f'
  on-secondary-fixed-variant: '#46464b'
  tertiary-fixed: '#ffddbb'
  tertiary-fixed-dim: '#ffb868'
  on-tertiary-fixed: '#2b1700'
  on-tertiary-fixed-variant: '#673d00'
  background: '#f9f9ff'
  on-background: '#181c23'
  surface-variant: '#e0e2ed'
typography:
  display-lg:
    fontFamily: Inter
    fontSize: 48px
    fontWeight: '700'
    lineHeight: '1.1'
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: '600'
    lineHeight: '1.2'
    letterSpacing: -0.01em
  headline-lg-mobile:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: '1.2'
  title-md:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: '500'
    lineHeight: '1.4'
  body-lg:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '400'
    lineHeight: '1.6'
  body-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: '1.5'
  label-sm:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '600'
    lineHeight: '1.2'
    letterSpacing: 0.05em
rounded:
  sm: 0.5rem
  DEFAULT: 1rem
  md: 1.5rem
  lg: 2rem
  xl: 3rem
  full: 9999px
spacing:
  unit: 8px
  container-padding: 40px
  gutter: 24px
  stack-sm: 12px
  stack-md: 24px
  stack-lg: 48px
---

## Brand & Style
The design system is centered on a "Liquid Glass" aesthetic, specifically tailored for a high-stakes educational environment (IELTS/TOEFL). It prioritizes focus, clarity, and a sense of calm confidence. By moving away from traditional data-heavy dashboards, this design system treats the writing interface as a premium, meditative space.

The style is a refined evolution of **Glassmorphism**, characterized by:
- **Optical Clarity:** High-contrast text over semi-transparent surfaces to ensure accessibility.
- **Refractive Edges:** 1px inner borders that mimic the way light catches the edge of thick glass.
- **Airy Composition:** Massive amounts of whitespace and "breathable" layouts to reduce exam-induced anxiety.
- **Dynamic Depth:** Using varying levels of backdrop-blur and shadow-casting to indicate hierarchy rather than heavy colors.

## Colors
The palette is rooted in a serene, "Daybreak" light mode. 

- **Primary & Neutral:** A base of pure white and #FBFBFE (off-white with a hint of blue) creates the canvas. 
- **Accent Tones:** Royal Lavender is used for secondary focus areas, while a soft Sky Blue handles primary actions. 
- **The "Focus" Accent:** A gentle Coral (#FF7F6E) is reserved exclusively for critical calls to action (e.g., "Submit Essay") or indicating time-sensitive alerts, ensuring they pop against the cool-toned glass backdrop.
- **Glass Specification:** Surfaces should use a 70-80% opacity white with a `backdrop-filter: blur(20px)` and a subtle `saturate(180%)` to enhance the background colors underneath.

## Typography
The system utilizes **Inter** for its neutral, highly legible character, essential for long-form reading and writing tasks.

- **Scale:** High contrast between Display and Body sizes creates an editorial feel.
- **Readability:** Body text uses a generous 1.6x line height to prevent line-tracking fatigue during 60-minute writing sessions.
- **Hierarchy:** Uppercase labels are used for meta-data (e.g., "Word Count", "Time Remaining") to differentiate them from the user's primary text input.

## Layout & Spacing
The layout follows a **Fluid Grid** model with strict maximum widths to maintain optimal line lengths for writing.

- **The Main Canvas:** A central column-focused layout for the essay editor (max-width: 800px) to mimic a physical sheet of paper.
- **Floating Navigation:** The global navigation is detached from the viewport edges, appearing as a "pill" or "island" at the top or bottom of the screen.
- **Breakpoints:**
  - **Desktop (1440px+):** 12-column grid, 40px margins.
  - **Tablet (768px - 1024px):** 8-column grid, 24px margins.
  - **Mobile:** 4-column grid, 16px margins; navigation moves to a bottom-floating glass bar for thumb reachability.

## Elevation & Depth
Depth is the core of this design system. Rather than standard drop shadows, it uses **Multi-layered Ambient Occlusion**:

1.  **Level 0 (Base):** Subtle background gradients of Lavender and Blue (#F0F4FF to #F9F0FF).
2.  **Level 1 (Cards):** 20px blur, 70% white fill, 1px white border (20% opacity). Shadow: `0 8px 32px rgba(0,0,0,0.04)`.
3.  **Level 2 (Modals/Active Elements):** 40px blur, 85% white fill, 1.5px white border (40% opacity). Shadow: `0 16px 48px rgba(0,0,0,0.08)`.

**Edge Refraction:** All glass elements must feature a 1px `inset` box shadow in pure white to simulate the "lip" of a glass pane.

## Shapes
The shape language is extremely soft and approachable. 
- **Primary Radius:** 24px (rounded-lg) is the standard for cards and functional containers.
- **Extreme Radius:** 32px+ (rounded-xl) for modals and primary input areas.
- **Interaction Feedback:** Buttons and interactive chips transition from soft-rectangles to more pronounced "squircle" shapes on hover to provide a tactile sense of depth.

## Components
- **The Writing Canvas:** A large, elevated card with 32px padding and a subtle inner-glow. The cursor is custom-styled in primary blue.
- **Floating Nav:** A pill-shaped bar with a heavy backdrop blur (30px) and dark-gray icons.
- **Glass Buttons:** 
  - *Primary:* Solid Sky Blue with a 15% white overlay on hover.
  - *Secondary:* Translucent white with a 1px border.
- **Progress Rings:** Instead of bars, use thin-stroke circular rings for "Time Left" and "Word Limit" to maintain the "airy" feel.
- **Hover Glows:** Cards should emit a very faint, colored outer glow (primary blue or lavender) when the user interacts with them, simulating light passing through glass.
- **Inputs:** Text fields are not outlined; they are slightly more opaque glass wells that darken by 2% on focus.