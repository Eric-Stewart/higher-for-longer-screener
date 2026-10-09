# Higher-for-Longer Design Contract

## 0. Research Log
- **Taste foundations:** selected the **Operational** direction: dense comparison, stable dimensions, restrained semantic color, and native controls. Rejected editorial cream/serif, framework-blue, gradients, glass, decorative blobs, and uniform card grids because this is a data-dense fintech decision tool.
- **Fintech conventions:** borrowed the compact blotter rhythm, right-aligned tabular numbers, persistent filter rail, and visible data provenance common to professional research terminals. No third-party brand assets or copy are used.
- **Responsive lane:** desktop table becomes a scan-first card list below 768px; controls wrap without horizontal page scrolling. The table itself owns horizontal overflow at intermediate widths.
- **Performance lane:** target LCP <= 2.5s and CLS <= 0.1 for `/` on a mid-tier mobile device over simulated 4G with sample mode; no claim is made until measured. Data fetches are user initiated.

## 1. Atmosphere & Identity
**Precise, sober, operational.** The audience is a self-directed fundamental investor screening small caps under restrictive rates. The signature element is a segmented score rail: eight narrow cells expose pass/fail/missing status before a drawer is opened. Primary taste direction: Operational. Borrowed from expressive direction only: a high-contrast vermilion action accent used sparingly for the primary run button and active focus—not decoration.

## 2. Color
Use a 70/25/5 proportion: 70% ink/navy workspace, 25% layered panels, <=5% accent and status.

| Token | Hex | Role |
|---|---|---|
| `ink-950` | `#071019` | app background |
| `ink-900` | `#0B1723` | header / raised panel |
| `ink-850` | `#10202E` | card / input background |
| `ink-800` | `#182B3A` | hover / selected row |
| `line-700` | `#294050` | borders and dividers |
| `slate-400` | `#8EA2B2` | secondary text |
| `slate-200` | `#D5E0E7` | body text |
| `paper-50` | `#F4F8FA` | primary text / key figures |
| `signal-500` | `#F15A3A` | primary action and active focus |
| `signal-400` | `#FF8066` | hover accent |
| `good-500` | `#35B878` | pass / positive |
| `warn-500` | `#E7A83E` | missing / caution |
| `bad-500` | `#E05A67` | fail / error |
| `info-500` | `#4FB3BF` | source / neutral data badge |

All body text and controls must meet WCAG AA (4.5:1 normal, 3:1 large/UI). Color is never the only status indicator: labels, icons, or text accompany it.

## 3. Typography
One family system, chosen for numeric clarity rather than generic branding:
- UI/data: `"IBM Plex Sans", "Roboto Condensed", "Arial Narrow", system-ui, sans-serif`.
- Numeric cells: same stack with `font-variant-numeric: tabular-nums lining-nums`.
- Code/ticker micro-labels: `"IBM Plex Mono", "SFMono-Regular", Consolas, monospace`.

Scale: 11/14 (micro), 12/16 (caption), 14/20 (body), 16/22 (control/section), 20/26 (page), 28/32 (key score). Weights: 400, 500, 600, 700. No serif display face. Long names truncate in tables and wrap to two lines on cards.

## 4. Spacing & Layout
Base unit: **4px**. Scale: 4, 8, 12, 16, 20, 24, 32, 40, 48. Radii: 4px controls, 8px panels, 12px drawer only. Borders: 1px. Max workspace: 1600px with 16px mobile, 24px tablet, 32px desktop gutters.

Mobile (<768px): single column; results render as cards; horizontal control strips wrap; detail drawer fills viewport. Tablet (768–1099px): table owns horizontal scrolling with sticky ticker and header. Desktop (>=1100px): two-tier toolbar and full table; detail drawer is 520px fixed right. The page owns vertical scroll; drawer body scrolls independently while its header/footer remain fixed.

## 5. Components and States
- **Button:** solid primary, bordered secondary, text tertiary; default/hover/focus-visible/active/disabled/loading. Focus ring is 2px `signal-400` plus 2px offset against `ink-950`.
- **Input/select:** `ink-850`, `line-700`; hover border `slate-400`; focus ring; invalid `bad-500` with text; disabled reduced contrast but remains legible.
- **Metric threshold field:** explicit label, unit suffix, current default, keyboard-safe number input.
- **Status chip:** pass/fail/missing/source/sample with text and shape differences.
- **Table:** sticky header, right-aligned metrics, sortable header buttons with direction text for assistive tech, row hover and keyboard selection. Empty/loading/error rows span all columns.
- **Result card:** identity, score, segmented rail, key metrics, source line; a disclosure button opens details.
- **Drawer/dialog:** modal semantics, labelled title, Escape close, visible close button, focus starts at close/title and returns to trigger.
- **Toast/notice:** reserved stable area; `role=status` for success, `role=alert` for errors.
- **Skeleton:** fixed dimensions, no pulsing when reduced motion is requested.

Every interactive primitive covers default, hover, focus-visible, active, disabled, and loading where applicable. Data surfaces cover empty, partial/missing, upstream error, and sample states.

## 6. Motion & Interaction
Durations: 120ms hover, 180ms drawer/overlay. Easing: `cubic-bezier(0.2, 0, 0, 1)`; no bounce. Only opacity, color, and drawer transform animate. Numbers, rows, and charts never animate on initial render. `prefers-reduced-motion: reduce` disables transforms and reduces durations to 0ms.

## 7. Depth & Surface
Flat operational layers use borders and background shifts, not blanket shadows. Only the modal drawer has a single `-12px 0 32px rgba(0,0,0,.35)` shadow to communicate elevation over the table. No blur, glass, gradients, or decorative shadows.

## 8. Accessibility Constraints & Accepted Debt
- Complete keyboard operation; visible focus; 44px minimum mobile targets; native form elements; status text beyond color; table headers use `aria-sort`.
- Loading and upstream errors are announced. Missing values display `N/A` and a reason, never an empty cell.
- The qualitative checklist and notes persist locally per ticker and are labelled as user-entered, not financial data.
- Accepted debt: no full focus trap library; the native `<dialog>` element provides modal focus containment in supported browsers. Older browsers receive an in-page modal fallback through dialog CSS but are not a target.
- Accepted debt: IBM Plex is not fetched remotely; the fallback stack avoids a render-blocking font request and preserves offline behavior.
