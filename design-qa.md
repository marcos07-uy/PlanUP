# PlanUp design QA

## Evidence

- Source visual truth: `design/reference-option-1.png` (853 x 1844 px).
- Implementation screenshot: `design/implementation-mobile.png` (390 x 844 px).
- Side-by-side comparison: `design/qa-comparison.jpg` (780 x 844 px).
- CSS viewport: 390 x 844 px at device scale factor 1.
- Density normalization: the source was resized to 390 x 844 px before comparison; the implementation was captured natively at 390 x 844 px.
- State: coach `Marcos`, athlete `Sofía Rodríguez`, Tuesday 18 August, populated daily session, editor closed.

## Full-view comparison

The normalized side-by-side evidence confirms the same principal composition: black masthead, saturated red full-bleed surface, athlete selector, seven-day strip, oversized date, editorial workout sections, black icon blocks, and a high-contrast edit action. The hierarchy, content order, color balance, and first-viewport density follow the selected visual target.

## Focused-region comparison

A separate crop was not needed because both 390 px-wide screens are shown at native readable size in the 780 x 844 comparison. Athlete selection, week strip, heading typography, all three workout sections, icons, body copy, dividers, and the edit action can be evaluated directly.

## Required fidelity surfaces

- Fonts and typography: Barlow Condensed provides the condensed italic athletic display voice; Inter keeps workout copy readable. Weight, capitalization, hierarchy, and wrapping are consistent with the target. The implementation deliberately uses a slightly smaller date so the entire workout and primary action remain visible.
- Spacing and layout rhythm: the implementation matches the target's continuous surface, strong horizontal rules, square icon regions, and compact vertical rhythm. It avoids nested cards and preserves 390 px without horizontal overflow.
- Colors and visual tokens: black, white, and saturated red map directly to the selected direction, with sufficient contrast for controls and body text.
- Image and icon fidelity: the target contains no photographic assets. Functional marks use Phosphor icons; no placeholder glyphs or custom CSS/SVG drawings replace visible icons.
- Copy and content: Spanish coach/athlete terminology, Tuesday 18 August date, warm-up, strength, WOD, and edit action match the intended MVP state. Accents and Uruguayan Spanish forms were corrected.

## Interaction and runtime checks

- Tested week-date navigation.
- Tested populated and empty session states.
- Tested opening the session editor, editing its textarea, saving, and success feedback.
- Checked browser console and page errors: none.
- Production build and PWA service-worker generation passed.

## Comparison history

1. Initial capture: browser rendered a blank screen because the Cognito dependency expected `global`. Fixed the Vite browser definition to map it to `globalThis`; post-fix capture rendered normally.
2. First visual pass: WOD content was grouped into the strength block, Spanish date capitalization drifted, and the edit action fell below the first viewport. Fixed semantic workout parsing, sentence-case date formatting, and mobile vertical density.
3. Post-fix evidence: `design/qa-comparison.jpg` shows all three workout sections and the edit action inside the same 390 x 844 viewport, with no P0/P1/P2 mismatch remaining.

## Findings

No actionable P0, P1, or P2 issues remain.

## Follow-up polish

- P3: a future branded PlanUp logo asset could replace the typographic wordmark once brand exploration is in scope.

final result: passed
