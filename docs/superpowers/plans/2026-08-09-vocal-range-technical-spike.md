# Vocal Range Technical Spike Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a browser-only A/B pitch-detection spike with deterministic synthetic benchmarks and exportable real-microphone diagnostics.

**Architecture:** One `MicrophoneController` emits one PCM frame per interval. `ABRunner` sends that exact frame to both detector adapters, then feeds shared signal metrics and detector-specific pitch readings into stable-note trackers. Pure DSP modules are covered by Vitest; the browser layer is a minimal diagnostic shell.

**Tech Stack:** Vite, TypeScript, Web Audio API, `pitchy@4.1.0`, Vitest.

---

### Task 1: Scaffold and contracts

**Files:** `package.json`, `package-lock.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `src/dsp/types.ts`

- [ ] Create Vite/TypeScript/Vitest configuration and install exact `pitchy@4.1.0`.
- [ ] Define typed detector, quality, stability, observation, capture summary, and benchmark contracts.
- [ ] Run `npm test` and `npm run build`; expect both commands to exit 0 once later tasks are complete.

### Task 2: Note mapping and detector adapters

**Files:** `src/dsp/NoteMapper.test.ts`, `src/dsp/NoteMapper.ts`, `src/dsp/PitchyMpmAdapter.test.ts`, `src/dsp/PitchyMpmAdapter.ts`, `src/dsp/YinBackupAdapter.test.ts`, `src/dsp/YinBackupAdapter.ts`

- [ ] Write failing note-mapping tests for A4, C4, cents offsets, zero, and invalid frequencies; run them and confirm missing-module failures.
- [ ] Implement A4=440 equal-tempered note mapping and confirm tests pass.
- [ ] Write failing adapter tests for clean tones, silence, range limits, confidence, and input lengths; run and confirm expected failures.
- [ ] Implement one reusable Pitchy detector per frame size and a preallocated, range-limited YIN difference/CMND detector with parabolic interpolation.
- [ ] Run focused adapter tests and confirm they pass.

### Task 3: Signal and stability layers

**Files:** `src/dsp/SignalQualityEvaluator.test.ts`, `src/dsp/SignalQualityEvaluator.ts`, `src/dsp/StableNoteDetector.test.ts`, `src/dsp/StableNoteDetector.ts`

- [ ] Write failing tests for silence calibration, SNR, clipping, noisy/usable states, stable duration, glide rejection, and octave ambiguity.
- [ ] Run focused tests and confirm failures are caused by missing behavior.
- [ ] Implement running noise-floor calibration plus RMS/peak/clipping/SNR classification.
- [ ] Implement elapsed-time stable windows using log-frequency median, cents spread, drift, usable ratio, and octave-cluster checks.
- [ ] Re-run focused and full test suites.

### Task 4: Synthetic fixtures and A/B metrics

**Files:** `src/benchmark/syntheticFixtures.test.ts`, `src/benchmark/syntheticFixtures.ts`, `src/benchmark/metrics.test.ts`, `src/benchmark/metrics.ts`, `src/benchmark/runSyntheticBenchmark.ts`, `src/dsp/ABRunner.test.ts`, `src/dsp/ABRunner.ts`

- [ ] Write failing deterministic fixture tests for frequency, vibrato, glide, SNR mixing, hum, clipping, and silence.
- [ ] Implement seeded generators and frame slicing for 44.1/48 kHz and 4096/8192 samples.
- [ ] Write failing metric tests for percentile, cents, octave, no-detection, and timing summaries.
- [ ] Implement metrics and `ABRunner`, ensuring both adapters receive the same `Float32Array` object.
- [ ] Add a Node benchmark script that emits JSON for both configurations and run it.

### Task 5: Microphone capture and debug view

**Files:** `src/audio/MicrophoneController.ts`, `src/ui/DebugView.ts`, `src/style.css`, `src/main.ts`, `index.html`

- [ ] Write browser-independent controller lifecycle tests where practical through injected Web Audio factories and real data callbacks.
- [ ] Implement user-gesture microphone start, requested processing constraints, actual sample rate, selected `fftSize`, elapsed-time cadence, page-visibility handling, and teardown.
- [ ] Implement the diagnostic fields and start/stop/calibrate/reset/configuration controls.
- [ ] Store aggregate observation summaries without raw PCM; implement JSON download and clipboard text export.

### Task 6: Verification

**Files:** `README.md`

- [ ] Document local start, HTTPS/device caveats, fixture command, export format, and the real-device checklist.
- [ ] Run `npm test -- --run`, `npm run benchmark`, and `npm run build`; record exact results.
- [ ] Start the Vite server, verify HTTP rendering, run a browser smoke test, and inspect console errors.
- [ ] Compare implementation against every requirement in the approved design and report remaining real-device gates without declaring production readiness.
