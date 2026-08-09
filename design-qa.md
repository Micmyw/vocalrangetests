# Vocal Range Test MVP Design QA

## Comparison target

- Source visual truth: `docs/superpowers/specs/assets/vocal-range-mvp-visual-reference.png`
- Browser-rendered implementation: `output/mvp-result-desktop.png`
- Source pixels: 1435 × 1096 at 96 DPI.
- Implementation pixels: 1440 × 1100 at 96 DPI.
- CSS viewport: 1440 × 1100 with `deviceScaleFactor: 1`.
- Normalization: no density conversion was required; the 5 px × 4 px canvas difference was treated as negligible edge crop.
- State: English light-theme Result fixture, G♯3 lowest, E5 highest, 20 semitones, 1.67 octaves.

## Full-view comparison evidence

The source and implementation were opened together in one comparison input after the final capture. The implementation preserves the selected design's pale mineral-blue canvas, navy hierarchy, cobalt actions, saffron measured span, asymmetric desktop split, fine rules, compact numeric readouts, and restrained measurement aesthetic. Major anchors align: header, two-line H1, result heading, endpoint values, Measured range, overlap explanation, action row, and the first supporting-content section.

The production flow intentionally shows Room, Lowest, and Highest in the step rail instead of copying the source's two endpoint-only rail. This is required by the approved calibration state and does not change the visual hierarchy. The implementation also omits fake ±0.12 Hz uncertainty and displays actual captured frequencies only.

## Focused comparison evidence

- Typography: Inter Variable is bundled locally; display, body, numeric, and micro-label weights were checked at desktop and mobile sizes. The H1 now holds the source's two-line desktop shape.
- Spacing and layout: desktop result regions and action row match the reference proportions; the 390 × 844 mobile layout has no horizontal overflow and keeps the Start button fully visible.
- Colors and tokens: navy, cobalt, pale blue, saffron, and rule colors remain within the selected direction. Small faint text was darkened to pass WCAG contrast.
- Image and asset fidelity: the source has no photographic or illustrative assets requiring generation. Phosphor supplies interface icons. The functional Measured range is DOM-rendered so its note positions and frequency anchors remain data-driven and accessible.
- Copy and content: `Measured range`, `Stable lock`, endpoint labels, range overlap caveat, retest actions, head voice/falsetto caveat, and privacy language match the frozen product decisions.

## Comparison history

### Iteration 1 — blocked

- [P1] Desktop H1 wrapped into three lines instead of the source's two-line composition.
- [P1] The result tool started too far right and too low, leaving the action row below the intended visual rhythm.
- [P2] Endpoint labels appeared above the notes, reversing the source hierarchy.
- [P2] Measured range was visually sparse and lacked technical frequency anchors.

Fixes: widened the desktop intro track, reduced tool inset, aligned hero padding, reordered endpoint note/label/readout content, reserved the result-height hero shell, expanded the range grid, and added real octave-frequency anchors.

Post-fix evidence: `output/mvp-result-desktop.png` at 1440 × 1100. No P0/P1/P2 finding from this iteration remains.

### Iteration 2 — blocked

- [P1] At 390 × 844 the Start button began just below the viewport.
- [P1] A denied microphone incorrectly marked Room complete and asked the user to retry a Lowest note that had never started.
- [P2] Mobile range ticks overlapped the range caption.
- [P2] Programmatic H2 focus showed an intrusive default outline.
- [P2] `/privacy` fell back to the homepage in the local Vite server.
- [P2] Lighthouse found insufficient contrast on small faint labels.

Fixes: compacted only the mobile intro spacing while preserving 44 px navigation targets; made microphone recovery keep Room current with a clear `Microphone access needed` heading; resized the mobile chart; suppressed non-interactive heading outlines while retaining button/link focus rings; added the local/preview privacy rewrite; and raised faint-text contrast.

Post-fix evidence: `output/mvp-home-mobile.png`, browser snapshots for keyboard microphone recovery and `/privacy`, and production-build Lighthouse accessibility 100 on desktop and mobile. No P0/P1/P2 finding from this iteration remains.

## Browser and accessibility verification

- Browser surface: Codex desktop browser inspection of `/`, `/privacy`, and `/design-result.html`.
- Desktop viewport: 1440 × 1100.
- Mobile viewport: 390 × 844, touch/mobile emulation.
- Primary interactions: keyboard Tab to Start, Enter activation, microphone-denied recovery, hash navigation, FAQ expand/collapse, and Result action presence.
- Responsive checks: no horizontal overflow at 390 px; Start button visible above the fold; result actions remain 48 px high and full width on mobile.
- Console: no error, warning, or issue messages after final navigation.
- Production-build Lighthouse: Accessibility 100 desktop and 100 mobile. Preview-only SEO reduction is expected because Preview intentionally uses `noindex,nofollow`; local HTTP-only HTTPS failures are not production findings.

## Remaining P3 follow-up

- A custom brand favicon is intentionally deferred; the MVP suppresses the browser's default missing-favicon request without adding an unapproved decorative mark.

## Implementation checklist

- [x] Fonts, weights, hierarchy, and wrapping checked.
- [x] Desktop and mobile spacing, alignment, and overflow checked.
- [x] Colors, contrast, states, and focus checked.
- [x] Icon library usage checked; no custom inline SVG or decorative microphone art added.
- [x] App copy and frozen product caveats checked.
- [x] All P0/P1/P2 findings fixed and visually rechecked.

final result: passed
