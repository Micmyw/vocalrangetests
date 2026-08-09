# Real Device Validation Harness Design

## Goal

Extend the existing browser-only pitch spike into a controlled real-person validation harness. The harness collects paired Pitchy MPM and YIN observations from the same PCM frames, guides each tester through repeatable lowest/highest endpoint attempts, and exports an anonymous session report. It is not the formal Vocal Range Test product.

## Scope

The harness includes microphone permission, three seconds of quiet-room calibration, three successful lowest attempts, three successful highest attempts, retry tracking, phonation tags, endpoint repeatability, session-level detector metrics, JSON export, text copy, and a temporary HTTPS preview.

It excludes the formal homepage, final result experience, SEO content, voice-type classification, accounts, backend storage, audio upload, raw-audio recording, AI, and adjacent music tools. The preview must remain `noindex,nofollow` and must not use `vocalrangetests.com`.

## Fixed Technical Configuration

- Primary detector: `pitchy@4.1.0` MPM.
- Primary frame configuration: 4096 samples at a 20 Hz analysis cadence.
- Paired comparison: the existing range-limited YIN implementation.
- Both detectors synchronously receive the exact same `Float32Array` frame from one `MicrophoneController` capture path.
- The actual `AudioContext.sampleRate` and available `MediaTrackSettings` are recorded.

## Test Flow

The UI follows a deterministic state machine:

1. `setup`: create or enter an anonymous tester ID and review the test instructions.
2. `requesting-permission`: request microphone access from a user gesture.
3. `calibrating`: collect three seconds of quiet-room frames for the noise floor.
4. `lowest`: collect fixed three-second attempts until three successful Pitchy endpoint captures have been accepted.
5. `highest`: repeat the same process until three successful Pitchy endpoint captures have been accepted.
6. `summary`: stop the microphone and show/export the complete anonymous session.

Every attempt uses a fixed three-second window so neither detector controls the amount of PCM it receives. A failed attempt remains in the session and increments retry count. The same endpoint repeats automatically until three primary-detector successes exist; a tester can stop the session at any point. The session summary marks incomplete endpoints explicitly.

The tester selects one or more attempt tags before starting: `modal`, `head-falsetto`, `breathy`, `vibrato`, `glide`, or `fry`. The selected tags are copied into that attempt and can change between attempts.

## Attempt Aggregation

Each attempt retains its observation slice without PCM. For each detector it records:

- success/no-detection;
- representative stable frequency, MIDI, note, and cents;
- clarity/confidence at the representative stable frame;
- latency from attempt start to first stable frame;
- whether any frame was octave-ambiguous;
- final or dominant reject reason;
- detector processing-time p50/p95.

Shared attempt fields include tester/session identifiers, endpoint, attempt number, tags, timestamps, OS/browser/device description, sample rate, media-track settings, RMS and SNR summaries, clipping presence, and retry status.

The representative stable result is the median log-frequency of stable frames. Its MIDI/note/cents mapping is computed from that median. Signal summaries use the attempt-frame median for RMS and SNR, while clipping is true if any attempt frame crosses the existing clipping threshold.

## Endpoint Summary

For each Lowest/Highest endpoint, the harness uses the first three successful Pitchy captures and calculates:

- three note labels;
- maximum pairwise MIDI/semitone difference;
- repeatability pass when maximum difference is at most one semitone;
- Pitchy and YIN stable-capture success rates across all endpoint attempts;
- endpoint completion/incomplete status.

Failed and retried attempts remain available for success-rate and retry metrics; they never overwrite earlier evidence.

## Session Summary

The final summary contains:

- Pitchy and YIN success rates;
- per-detector no-detection rates;
- octave-ambiguity counts and paired one-octave disagreement counts;
- retry count;
- Lowest and Highest repeatability summaries;
- detector processing-time p50/p95 across attempt frames;
- environment and calibration metadata.

A paired octave error is flagged when both algorithms return stable results for an attempt and their representative MIDI values differ by 12 semitones, within one semitone tolerance. This is a detector-disagreement indicator, not ground-truth accuracy; real tester annotations remain necessary for true octave-error measurement.

## Privacy and Export

The harness never asks for or exports a name or email. It does not record, persist, or export PCM/audio. Anonymous tester ID, raw User-Agent, parsed device environment, track settings, diagnostic observations, attempts, endpoints, and session summary are exported as schema version 2 JSON. Copy-to-text contains a compact, aggregation-friendly report with the same key outcome metrics.

All data remains in memory until the tester downloads or copies it. No backend, analytics, localStorage, or upload is introduced.

## Debug Interface

The interface remains intentionally diagnostic. It adds only:

- anonymous ID and attempt-tag controls;
- the unified testing instructions;
- phase, countdown, endpoint, success/retry, and attempt progress;
- the existing live RMS/noise/SNR/clipping and dual-detector readings;
- endpoint cards and a session summary table;
- start/stop/retry, JSON download, and text-copy controls.

The 8192 configuration selector is removed from the real-device flow. The fixed candidate remains 4096/20 Hz; YIN stays visible only as the same-frame comparison.

## Error Handling

- Permission denial and unavailable Web Audio APIs leave the session in a recoverable setup/error state.
- Page hiding stops capture to avoid invalid background timing and marks the active attempt incomplete.
- Calibration frames cannot count as attempts.
- An attempt that contains no usable frames is retained as a failed retry with its reject reasons.
- Export works for incomplete sessions and identifies missing endpoint evidence.

## Testing Strategy

Pure session aggregation and state transitions are implemented test-first with Vitest. Tests cover fixed durations, three-success endpoint progression, retries, paired same-frame processing, note/repeatability calculations, octave-disagreement accounting, incomplete sessions, privacy, and schema/text export.

Browser automation injects a shared synthetic MediaStream after a silent calibration period. It verifies a full six-attempt path, the Debug View, export controls, cleanup, and console state. Additional classed PCM simulations cover modal harmonic stacks, breath noise, vibrato, glide, fry-like pulses, and detector failure/retry paths. These simulations validate the harness but do not count toward the real-person gate.

## Temporary Preview and Stop Condition

After local tests, production build, and browser verification pass, deploy the static Vite build as a Vercel preview URL over HTTPS. Do not use `--prod`, do not attach the production domain, and do not remove `noindex,nofollow`.

Then stop. The next decision requires 3–4 real-person sessions across iPhone Safari, Android Chrome, Windows Chrome/Edge, and macOS Safari. No formal MVP work begins before those reports are reviewed.

