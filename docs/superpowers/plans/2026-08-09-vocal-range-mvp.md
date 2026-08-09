# Vocal Range Test MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the validated pitch-detection spike into the approved English consumer Vocal Range Test at `/`, with one successful Lowest and Highest capture, an understandable result, static SEO content, a noindex privacy page, and an isolated Vercel Preview.

**Architecture:** Keep the validated microphone and DSP modules, add a Pitchy-only production frame processor, a bounded endpoint capture evaluator, and a consumer state controller. Mount the dynamic tool into static homepage HTML so the H1 and supporting content are always crawlable. Preserve diagnostic source separately and exclude it from the consumer build.

**Tech Stack:** Vite 8, TypeScript 7, Web Audio API, `pitchy@4.1.0`, Vitest, `@vercel/analytics`, bundled Inter variable font, Phosphor icons, Vercel static deployment.

---

**Execution note:** This workspace is not a Git repository, so the worktree and commit steps in the generic Superpowers workflow cannot apply. Execute inline in the existing directory, keep edits scoped, and use test/build/deployment evidence as checkpoints. Do not initialize or publish a repository without separate authorization.

## File Structure

### New production modules

- `src/product/ProductConfig.ts`: fixed production timing and detector configuration.
- `src/product/types.ts`: consumer states, endpoint results, view snapshots, and ports.
- `src/product/PitchFrameProcessor.ts`: raw metrics → Pitchy → quality → stability pipeline.
- `src/product/EndpointCaptureController.ts`: bounded attempt, tail confirmation, ambiguity handling, representative stable result.
- `src/product/RangeCalculator.ts`: note-consistent semitone and exact frequency-ratio octave math.
- `src/product/RangeOverlapCalculator.ts`: transparent conventional range overlap.
- `src/product/FailureMessages.ts`: internal reject reason to recovery copy mapping.
- `src/product/VocalRangeTestController.ts`: page state machine and microphone lifecycle.
- `src/product/VocalRangeTestView.ts`: accessible DOM rendering and interactions.
- `src/product/analytics.ts`: production-only event allowlist.

### New support files

- `src/validation-main.ts`: preserved diagnostic Harness entry moved out of production `main.ts`.
- `validation.html`: local diagnostic entry, not included in production build.
- `privacy/index.html`: static `/privacy` document.
- `design-result.html` and `src/product/design-result.ts`: local-only Result-state visual QA fixture, excluded from build inputs.
- `public/sitemap.xml`: canonical homepage only.
- `vercel.json`: clean privacy route and production headers/routing.
- `design-qa.md`: source-versus-rendered visual QA report.

### Modified files

- `src/dsp/SignalQualityEvaluator.ts`: expose raw metrics and pitch-aware quality evaluation while preserving Harness API.
- `src/audio/MicrophoneController.ts`: make an explicit `null` visibility source disable internal visibility ownership.
- `src/main.ts`: consumer composition root.
- `src/style.css`: approved responsive visual system.
- `index.html`: canonical static homepage and tool mount.
- `vite.config.ts`: multi-page homepage/privacy build and environment-aware robots metadata.
- `package.json` and `package-lock.json`: exact dependencies and scripts.

## Task 1: Lock Production Configuration and Result Math

**Files:**
- Create: `src/product/ProductConfig.ts`
- Create: `src/product/RangeCalculator.ts`
- Create: `src/product/RangeCalculator.test.ts`
- Create: `src/product/types.ts`

- [ ] **Step 1: Write failing result-math tests**

Cover G♯3 → E5, cross-octave ranges, exact-frequency decimal octaves, and rejection when Highest is not above Lowest:

```ts
expect(calculateRange(endpoint(207.65), endpoint(659.26))).toMatchObject({
  semitoneSpan: 20,
  octaveSpan: expect.closeTo(Math.log2(659.26 / 207.65), 5),
});
expect(calculateRange(endpoint(440), endpoint(439))).toEqual({
  ok: false,
  reason: "highest-not-above-lowest",
});
```

- [ ] **Step 2: Run RED**

Run: `npm test -- src/product/RangeCalculator.test.ts`  
Expected: FAIL because the production result modules do not exist.

- [ ] **Step 3: Add minimal result types, fixed config, and calculations**

Use:

```ts
export const PRODUCT_AUDIO_CONFIG = {
  frameSize: 4096,
  intervalMs: 50,
  calibrationMs: 3000,
  attemptTimeoutMs: 8000,
  tailConfirmationMs: 800,
} as const;

semitoneSpan = highest.midi - lowest.midi;
octaveSpan = Math.log2(highest.frequencyHz / lowest.frequencyHz);
```

- [ ] **Step 4: Run GREEN**

Run: `npm test -- src/product/RangeCalculator.test.ts`  
Expected: PASS.

## Task 2: Make Signal Quality Pitch-Aware and Add the Production Frame Processor

**Files:**
- Modify: `src/dsp/SignalQualityEvaluator.ts`
- Modify: `src/dsp/SignalQualityEvaluator.test.ts`
- Create: `src/product/PitchFrameProcessor.ts`
- Create: `src/product/PitchFrameProcessor.test.ts`

- [ ] **Step 1: Write failing quality-order tests**

Prove the public sequence and classification:

```ts
const metrics = quality.measure(frame);
const signal = quality.evaluateMeasurement(metrics, { frequencyHz: 220, confidence: 0.4 });
expect(signal.rejectReason).toBe("low-confidence");
```

Test clipping wins over pitch, a missing pitch becomes `no-pitch`, and a valid estimate with adequate raw signal becomes usable.

- [ ] **Step 2: Run RED**

Run: `npm test -- src/dsp/SignalQualityEvaluator.test.ts src/product/PitchFrameProcessor.test.ts`  
Expected: FAIL because `measure`, `evaluateMeasurement`, and `PitchFrameProcessor` are missing.

- [ ] **Step 3: Implement the combined evaluator without breaking ABRunner**

Expose `RawSignalMetrics`, retain `evaluate(frame)` for diagnostic callers, and add pitch-aware production evaluation. `PitchFrameProcessor.processFrame()` must call in this order:

```ts
const metrics = quality.measure(frame);
const startedAt = now();
const estimate = pitchy.detect(frame, sampleRate);
const processingTimeMs = now() - startedAt;
const signal = quality.evaluateMeasurement(metrics, estimate);
const stable = stableDetector.update({ timestampMs, estimate, quality: signal });
```

- [ ] **Step 4: Run GREEN and regression tests**

Run: `npm test -- src/dsp/SignalQualityEvaluator.test.ts src/product/PitchFrameProcessor.test.ts src/dsp/ABRunner.test.ts`  
Expected: PASS with unchanged diagnostic behavior.

## Task 3: Build the Bounded Endpoint Capture Evaluator

**Files:**
- Create: `src/product/EndpointCaptureController.ts`
- Create: `src/product/EndpointCaptureController.test.ts`
- Create: `src/product/FailureMessages.ts`
- Create: `src/product/FailureMessages.test.ts`

- [ ] **Step 1: Write failing capture tests**

Cover:

- no single-frame success;
- stable lock followed by 800 ms valid tail succeeds;
- terminal signal loss returns `insufficient-terminal-stability`;
- post-lock drift and octave ambiguity reject;
- timeout is finite and keeps the most useful reject reason;
- representative frequency uses log-median stable evidence.

```ts
expect(capture.update(stableObservation(600))).toMatchObject({ state: "collecting" });
expect(capture.update(stableObservation(1450))).toMatchObject({
  state: "success",
  endpoint: { note: "A3" },
});
```

- [ ] **Step 2: Run RED**

Run: `npm test -- src/product/EndpointCaptureController.test.ts src/product/FailureMessages.test.ts`  
Expected: FAIL because the evaluator and copy mapping do not exist.

- [ ] **Step 3: Implement minimal tail/ambiguity confirmation**

Keep a bounded observation window, record first stable lock, require stable evidence in the terminal window, reject ambiguity or drift, and return one terminal outcome. Map `insufficient-terminal-stability` exactly to:

```text
Keep the note steady a little longer.
```

- [ ] **Step 4: Run GREEN**

Run: `npm test -- src/product/EndpointCaptureController.test.ts src/product/FailureMessages.test.ts`  
Expected: PASS.

## Task 4: Add Transparent Range Overlap

**Files:**
- Create: `src/product/RangeOverlapCalculator.ts`
- Create: `src/product/RangeOverlapCalculator.test.ts`

- [ ] **Step 1: Write failing overlap tests**

Use a versioned conventional reference table with MIDI boundaries for Bass, Baritone, Tenor, Countertenor, Contralto, Mezzo-soprano, and Soprano. Test gender-neutral comparison, deterministic ordering, a maximum of three results, and empty output when overlap is not meaningful.

- [ ] **Step 2: Run RED**

Run: `npm test -- src/product/RangeOverlapCalculator.test.ts`  
Expected: FAIL because the calculator is missing.

- [ ] **Step 3: Implement documented overlap only**

Calculate intersection and union in semitones, require at least six semitones of intersection, sort by Jaccard overlap then intersection, and return at most three category labels. Include the reference source URL and version date in code comments/data metadata; do not infer gender or produce a definitive classification.

- [ ] **Step 4: Run GREEN**

Run: `npm test -- src/product/RangeOverlapCalculator.test.ts`  
Expected: PASS.

## Task 5: Implement Microphone Ownership and the Consumer State Machine

**Files:**
- Modify: `src/audio/MicrophoneController.ts`
- Modify: `src/audio/MicrophoneController.test.ts`
- Create: `src/product/VocalRangeTestController.ts`
- Create: `src/product/VocalRangeTestController.test.ts`

- [ ] **Step 1: Write failing lifecycle/state tests**

Cover Intro → permission → 3000 ms calibration → Lowest → Highest → Result, explicit retry, endpoint retest with recalibration, Test Again reset, permission failure, track failure, and hidden-page cancellation.

Also prove `visibilitySource: null` leaves visibility ownership to the consumer controller instead of falling back to `document`.

```ts
await controller.startTest();
emit(noiseFrame, 0);
emit(noiseFrame, 3000);
expect(controller.state).toBe("lowest-ready");

await controller.handleHidden();
expect(microphone.stop).toHaveBeenCalled();
expect(controller.state).toBe("lowest-ready");
```

- [ ] **Step 2: Run RED**

Run: `npm test -- src/audio/MicrophoneController.test.ts src/product/VocalRangeTestController.test.ts`  
Expected: FAIL for missing state controller and explicit-null behavior.

- [ ] **Step 3: Implement the state controller**

Inject the microphone, frame processor, capture factory, view, and time sources. Stop media on Result, reset, error, and hidden paths. Retest must reopen the microphone, rerun calibration, replace one endpoint, and recompute the result. Never persist state.

- [ ] **Step 4: Run GREEN**

Run: `npm test -- src/audio/MicrophoneController.test.ts src/product/VocalRangeTestController.test.ts`  
Expected: PASS.

## Task 6: Preserve the Harness and Compose the Consumer Entry

**Files:**
- Create: `src/validation-main.ts`
- Create: `validation.html`
- Replace: `src/main.ts`
- Create: `src/product/analytics.ts`
- Create: `src/product/analytics.test.ts`

- [ ] **Step 1: Move the current Harness composition without behavior changes**

Copy the existing `src/main.ts` Harness composition to `src/validation-main.ts`; point `validation.html` at it and keep `noindex,nofollow`. Do not add `validation.html` to Rollup production inputs.

- [ ] **Step 2: Write failing analytics allowlist tests**

Reject unknown events and any custom property object:

```ts
expect(() => analytics.track("result_viewed", { note: "A4" })).toThrow();
expect(analytics.track("result_viewed")).toBe(true);
```

- [ ] **Step 3: Run RED, implement analytics, and compose production dependencies**

Run: `npm test -- src/product/analytics.test.ts`  
Expected: FAIL before implementation.

Use `@vercel/analytics` only when `import.meta.env.PROD` and the consumer production environment is active. `src/main.ts` constructs Pitchy, frame processing, capture/controller/view, and a `MicrophoneController` with 4096/50 ms.

- [ ] **Step 4: Run GREEN and diagnostic regression**

Run: `npm test -- src/product/analytics.test.ts src/validation/ValidationHarnessController.test.ts`  
Expected: PASS.

## Task 7: Build the Accessible Consumer View Test-First

**Files:**
- Create: `src/product/VocalRangeTestView.ts`
- Create: `src/product/VocalRangeTestView.test.ts`
- Create: `src/product/design-result.ts`
- Create: `design-result.html`

- [ ] **Step 1: Write failing markup tests**

Assert one H2 per state, textual step progress, status live region, real buttons, explicit retry, Result fields, `Measured range`, caveat copy, and all three result actions. Assert the visualization is supplementary and complete result text exists outside it.

- [ ] **Step 2: Run RED**

Run: `npm test -- src/product/VocalRangeTestView.test.ts`  
Expected: FAIL because the view is missing.

- [ ] **Step 3: Implement view rendering and interactions**

Render from a typed snapshot. Use delegated button handling, focus the active H2, announce state changes, and keep stable structural regions. Use Phosphor regular/thin icons for checks and information. Do not handcraft SVG or substitute text glyphs for icons.

The local-only `design-result.html` renders the approved G♯3 → E5 Result snapshot for visual comparison and is excluded from production build inputs.

- [ ] **Step 4: Run GREEN**

Run: `npm test -- src/product/VocalRangeTestView.test.ts`  
Expected: PASS.

## Task 8: Implement Static Homepage SEO, Privacy, and Build Isolation

**Files:**
- Replace: `index.html`
- Create: `privacy/index.html`
- Modify: `vite.config.ts`
- Create: `src/seo/staticSeo.test.ts`
- Create: `public/sitemap.xml`
- Create: `vercel.json`

- [ ] **Step 1: Write failing static-source tests**

Verify homepage title/description/canonical, exactly one H1, permanent value copy, all six supporting H2 sections, `/privacy` link, no unsupported keyword stuffing, privacy `noindex, follow`, and a sitemap containing only the homepage.

- [ ] **Step 2: Run RED**

Run: `npm test -- src/seo/staticSeo.test.ts`  
Expected: FAIL against the diagnostic `index.html` and missing privacy page.

- [ ] **Step 3: Implement static documents and environment-aware robots**

Keep the dynamic mount inside static homepage content. Configure Vite inputs for `index.html` and `privacy/index.html` only. Local/Preview builds inject `noindex,nofollow`; production injects `index,follow` only on `/` while privacy remains `noindex,follow`.

The privacy page truthfully covers local microphone processing, no audio storage/upload, Vercel hosting, production Web Analytics, no accounts/payments/AI, retention controlled by providers, rights/contact, children, security, and changes. Use `privacy@vocalrangetests.com` and flag mailbox verification as a pre-production operational check.

- [ ] **Step 4: Run GREEN**

Run: `npm test -- src/seo/staticSeo.test.ts`  
Expected: PASS.

## Task 9: Recreate the Approved Visual System

**Files:**
- Replace: `src/style.css`
- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] **Step 1: Install exact UI dependencies**

Run: `npm install @fontsource-variable/inter @phosphor-icons/web @vercel/analytics --save-exact`  
Expected: package and lockfile contain exact installed versions while `pitchy` remains exactly `4.1.0`.

- [ ] **Step 2: Implement the selected visual reference**

Use the approved reference at `docs/superpowers/specs/assets/vocal-range-mvp-visual-reference.png`.

Implement:

- pale mineral-blue base;
- navy hierarchy and cobalt primary action;
- restrained saffron measured-range span;
- asymmetric desktop hero/tool grid;
- one-column mobile flow;
- subtle note grid, octave landmarks, semitone ticks, thin range lines;
- monospace Hz readouts without fake uncertainty;
- stable-lock confirmation and reduced-motion fallback;
- minimum-height tool shell without clipping;
- visible focus and 44 px touch targets.

Do not add neon, dark mode, cyberpunk styling, gradients, spectrum graphics, stock media, nested cards, or decorative microphone imagery.

- [ ] **Step 3: Run automated verification**

Run: `npm test`  
Expected: all existing diagnostic and new consumer tests PASS.

Run: `npm run build`  
Expected: TypeScript and Vite production build PASS; `dist` contains homepage and privacy but no diagnostic HTML entry.

## Task 10: Run Browser, Accessibility, and Visual Design QA

**Files:**
- Create: `design-qa.md`
- Create: `output/mvp-home-desktop.png`
- Create: `output/mvp-home-mobile.png`
- Create: `output/mvp-result-desktop.png`

- [ ] **Step 1: Start a strict local Vite preview**

Run: `npm run dev -- --host 0.0.0.0 --port 4173 --strictPort`  
Expected: the consumer homepage is available and the process stays running.

- [ ] **Step 2: Verify in the Codex in-app Browser**

Check desktop and mobile layouts, header anchors, Intro controls, keyboard focus, reduced motion, privacy route, console errors, and the local-only Result visual fixture.

- [ ] **Step 3: Perform blocking Product Design comparison**

Open the source visual and the rendered 1440 × 1100 Result screenshot together. Compare typography, spacing, tokens, asset/icon fidelity, copy, and interaction affordances. Record P0–P3 findings in `design-qa.md`, fix every P0/P1/P2, recapture, and repeat until the exact final line is:

```text
final result: passed
```

- [ ] **Step 4: Run final local verification**

Run: `npm test` and `npm run build` again after visual fixes.  
Expected: all tests and production build PASS with no new console errors.

## Task 11: Deploy an Isolated Consumer Preview

**Files:**
- Verify: `.vercel/project.json` remains linked to the diagnostic project and is not overwritten.

- [ ] **Step 1: Read the deployment skill and inspect existing linkage**

Confirm the current root `.vercel` points to `vocalrange-validation-harness`. Deploy from an isolated staging directory or explicit new-project context so the diagnostic project cannot be overwritten.

- [ ] **Step 2: Create the consumer Preview**

Deploy the verified `dist` artifact to a new Vercel project such as `vocalrangetests` without `--prod` and without attaching `vocalrangetests.com`.

- [ ] **Step 3: Verify the live Preview**

Check HTTPS, HTTP 200, Preview `noindex,nofollow`, canonical, `/privacy`, static HTML, responsive rendering, console, and microphone permission entry. Confirm no production Analytics request is emitted.

- [ ] **Step 4: Stop at the approved release boundary**

Report the Preview URL and evidence. Do not attach the production domain or announce production Go until the required iPhone Safari, Android Chrome, Windows Chrome/Edge, and macOS Safari real-device smoke checks pass.

## Self-Review Checklist

- [ ] Every approved spec section maps to a task.
- [ ] No production detector other than Pitchy is composed.
- [ ] Signal data flow uses the approved order.
- [ ] One successful capture per endpoint still requires full stability/tail/ambiguity checks.
- [ ] Hidden-page, refresh, retry, and retest behavior are tested.
- [ ] Semitone and decimal octave formulas are distinct and tested.
- [ ] Voice wording remains range overlap, never definitive classification.
- [ ] Static SEO content and Privacy behavior exist in raw HTML.
- [ ] Preview and production indexation are isolated.
- [ ] Product Design visual QA is a blocking gate.
- [ ] Real-device validation remains the final production gate.

