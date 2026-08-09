# Real Device Validation Harness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the existing browser pitch spike into an anonymous, same-frame, six-endpoint real-device validation harness with deterministic simulation and temporary HTTPS preview deployment.

**Architecture:** Keep `MicrophoneController -> ABRunner` as the only PCM path. Add pure attempt analysis and session aggregation modules, then let a small browser controller drive three-second calibration/attempt windows and render them through a diagnostic-only view. Export schema version 2 contains environment, aggregates, and per-frame diagnostics without PCM.

**Tech Stack:** Vite, TypeScript, Web Audio API, `pitchy@4.1.0`, range-limited YIN, Vitest, Playwright CLI, Vercel Preview.

## Global Constraints

- Primary detector and configuration remain Pitchy MPM, 4096 samples, 20 Hz.
- YIN receives the exact same `Float32Array` synchronously; never create a second recording path.
- Calibration and attempt windows are exactly 3000 ms based on audio-frame timestamps.
- Do not collect name, email, PCM, audio recordings, localStorage data, analytics, or backend data.
- Keep `noindex,nofollow`; never deploy to production or attach `vocalrangetests.com`.
- The working directory has no Git metadata, so checkpoint each task with fresh tests instead of commits.

---

### Task 1: Validation contracts and device environment

**Files:**
- Create: `src/validation/types.ts`
- Create: `src/validation/DeviceEnvironment.ts`
- Test: `src/validation/DeviceEnvironment.test.ts`

**Interfaces:**
- Produces: `PhonationTag`, `EndpointType`, `DeviceEnvironment`, `ValidationContext`, `DetectorAttemptResult`, `AttemptResult`, `EndpointSummary`, and `ValidationSessionSummary`.
- Produces: `detectDeviceEnvironment(userAgent: string, platform?: string): DeviceEnvironment`.

- [ ] **Step 1: Write failing environment tests**

```ts
expect(detectDeviceEnvironment(IPHONE_SAFARI)).toMatchObject({
  os: "iOS", browser: "Safari", device: "iPhone",
});
expect(detectDeviceEnvironment(ANDROID_CHROME)).toMatchObject({
  os: "Android", browser: "Chrome", device: "Android mobile",
});
expect(detectDeviceEnvironment(WINDOWS_EDGE)).toMatchObject({
  os: "Windows", browser: "Edge", device: "Desktop",
});
```

- [ ] **Step 2: Run `npx vitest run src/validation/DeviceEnvironment.test.ts` and verify the missing-module failure**
- [ ] **Step 3: Define the exact contracts and minimal deterministic UA parser**
- [ ] **Step 4: Re-run the focused test and verify it passes**

### Task 2: Attempt analysis and per-attempt stability reset

**Files:**
- Create: `src/validation/AttemptAnalyzer.ts`
- Test: `src/validation/AttemptAnalyzer.test.ts`
- Modify: `src/dsp/ABRunner.ts`
- Modify: `src/dsp/ABRunner.test.ts`

**Interfaces:**
- Consumes: `readonly ABObservation[]`, attempt start/end timestamps, endpoint/tags/context.
- Produces: `analyzeAttempt(input: AnalyzeAttemptInput): AttemptResult`.
- Produces: `ABRunner.resetStability(): void`, which leaves the calibrated noise floor intact.

- [ ] **Step 1: Write failing tests for median stable frequency, note mapping, confidence, stable latency, SNR/RMS, clipping, octave ambiguity, reject reason, and p50/p95**

```ts
const result = analyzeAttempt({
  observations: [observationAt(1000, 440), observationAt(1650, 440)],
  startedAtMs: 1000,
  endedAtMs: 4000,
  completed: true,
  endpoint: "highest",
  tags: ["modal"],
  context,
});
expect(result.pitchy).toMatchObject({ success: true, note: "A4", midi: 69 });
expect(result.pitchy.stableLatencyMs).toBe(650);
```

- [ ] **Step 2: Run the focused test and verify failure because the analyzer/reset API does not exist**
- [ ] **Step 3: Implement log-frequency median aggregation, dominant reject reason, finite SNR median, clipping-any, ambiguity-any, and processing percentiles**
- [ ] **Step 4: Add `resetStability()` and verify a new attempt does not inherit stable frames while calibration remains usable**
- [ ] **Step 5: Run `npx vitest run src/validation/AttemptAnalyzer.test.ts src/dsp/ABRunner.test.ts` and verify both pass**

### Task 3: Validation session state and summaries

**Files:**
- Create: `src/validation/ValidationSession.ts`
- Test: `src/validation/ValidationSession.test.ts`

**Interfaces:**
- Consumes: `AttemptResult` from Task 2.
- Produces: `ValidationSession.addAttempt(result)`, `currentEndpoint`, `successfulCount(endpoint)`, `isComplete`, `buildSummary()`.

- [ ] **Step 1: Write failing progression tests**

```ts
const session = new ValidationSession(context);
session.addAttempt(failedLowest);
expect(session.currentEndpoint).toBe("lowest");
expect(session.retryCount).toBe(1);
session.addAttempt(successfulLowest1);
session.addAttempt(successfulLowest2);
session.addAttempt(successfulLowest3);
expect(session.currentEndpoint).toBe("highest");
```

- [ ] **Step 2: Write failing summary tests for three notes, maximum MIDI difference, one-semitone repeatability, per-detector success/no-detection rates, octave disagreement, retry count, and incomplete endpoints**
- [ ] **Step 3: Run the focused test and verify expected missing-class failures**
- [ ] **Step 4: Implement the smallest session class that advances after three completed Pitchy successes per endpoint and retains every retry**
- [ ] **Step 5: Run the focused tests and then `npm test`**

### Task 4: Session export schema and privacy

**Files:**
- Create: `src/export/SessionExporter.ts`
- Test: `src/export/SessionExporter.test.ts`
- Keep: `src/export/CaptureExporter.ts` for the synthetic technical-spike tests only.

**Interfaces:**
- Consumes: `ValidationSession`, calibration summary, and diagnostic attempt observations.
- Produces: `createSessionExport(...)`, `serializeSessionExport(...)`, `formatSessionAsText(...)`.

- [ ] **Step 1: Write failing schema tests**

```ts
const report = createSessionExport(session, calibration);
expect(report.schemaVersion).toBe(2);
expect(report.session.summary.pitchy.successRate).toBe(1);
expect(JSON.stringify(report)).not.toMatch(/Float32Array|pcm|email|name/i);
expect(formatSessionAsText(report)).toContain("Lowest repeatability: PASS");
```

- [ ] **Step 2: Run the exporter test and verify the missing-module failure**
- [ ] **Step 3: Implement aggregate and per-frame diagnostic serialization, replacing non-finite numbers with null and excluding PCM**
- [ ] **Step 4: Implement compact text output containing environment, six endpoint notes, retries, detector success/no-detection/ambiguity, repeatability, and p50/p95**
- [ ] **Step 5: Run the focused exporter test and full suite**

### Task 5: Browser validation flow and diagnostic view

**Files:**
- Create: `src/validation/ValidationHarnessController.ts`
- Test: `src/validation/ValidationHarnessController.test.ts`
- Create: `src/ui/ValidationHarnessView.ts`
- Test: `src/ui/ValidationHarnessView.test.ts`
- Modify: `src/main.ts`
- Modify: `src/style.css`
- Modify: `README.md`

**Interfaces:**
- Controller callbacks: `startSession(testerId)`, `startAttempt(tags)`, `stopSession()`, `download()`, and `copy()`.
- View callbacks render phase/countdown/progress, live `ABObservation`, attempt history, endpoint summaries, and final session summary.

- [ ] **Step 1: Write failing controller tests with injected microphone/timestamp dependencies for 3000 ms calibration, 3000 ms attempts, retry progression, early stop, and visibility cancellation**
- [ ] **Step 2: Write failing static-view tests for anonymous ID, the six phonation tags, the unified tester instructions, all existing debug fields, Lowest/Highest progress, summary metrics, JSON download, and text copy**
- [ ] **Step 3: Run both focused test files and verify failures are caused by missing modules**
- [ ] **Step 4: Implement the controller so calibration frames never enter attempt results, every attempt calls `resetStability()`, and frame timestamps end each fixed window**
- [ ] **Step 5: Replace the old debug shell with the validation view, retaining readable diagnostics but removing the 8192 selector and manual 0.6-second calibration**
- [ ] **Step 6: Wire schema-v2 download/copy and delayed Blob URL revocation for Safari**
- [ ] **Step 7: Add the exact short tester instructions and document HTTPS/device procedure in README**
- [ ] **Step 8: Run focused tests, `npm test`, and `npm run build`**

### Task 6: Human-like simulation, browser validation, and Preview

**Files:**
- Create: `src/simulation/VocalLikeFixtures.ts`
- Test: `src/simulation/VocalLikeFixtures.test.ts`
- Create: `scripts/run-validation-simulation.ts`
- Modify: `package.json`
- Modify: `.gitignore`
- Generate: `validation-results/simulated-session.json` (ignored)

**Interfaces:**
- Produces: `generateVocalLikeFrame({ profile, frequencyHz, sampleRate, length, seed })` for `modal`, `head-falsetto`, `breathy`, `vibrato`, `glide`, and `fry` profiles.
- Adds: `npm run simulate:validation` with `simulated: true` in its JSON report.

- [ ] **Step 1: Write failing deterministic fixture tests for finite samples, bounded amplitude, repeatable seeds, harmonic/breathy differences, vibrato/glide movement, and fry-like irregular pulses**
- [ ] **Step 2: Run the focused fixture test and verify the missing-module failure**
- [ ] **Step 3: Implement the isolated simulation generator without adding it to the production UI or benchmark detector choice**
- [ ] **Step 4: Implement the simulation script: three seconds of noise calibration, one intentional failed retry, three 110 Hz Lowest successes, and three 440 Hz Highest successes using same-frame Pitchy/YIN processing**
- [ ] **Step 5: Run `npm run simulate:validation` and verify schema version 2, `simulated: true`, retry count one, and completed endpoint summaries**
- [ ] **Step 6: Run final `npm test`, `npm run benchmark`, `npm run build`, and `npm ls pitchy@4.1.0 --depth=0`**
- [ ] **Step 7: Use Playwright CLI with a synthetic `MediaStream` to complete the real browser flow, download JSON, copy text, verify no console warnings/errors, and confirm no PCM/name/email fields**
- [ ] **Step 8: Follow the Vercel skill state checks, deploy with `vercel deploy --no-wait` or its no-auth fallback, inspect deployment status, and return the HTTPS Preview URL without using `--prod`**
- [ ] **Step 9: Stop after Preview verification and wait for the 3–4 person Smoke Test data**

