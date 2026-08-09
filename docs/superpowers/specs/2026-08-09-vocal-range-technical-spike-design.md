# Vocal Range Technical Spike Design

## Goal

Build a minimal browser-only Vite/TypeScript application that measures one microphone PCM stream with Pitchy MPM and an independently implemented range-limited YIN detector, exposes signal/stability diagnostics, and produces repeatable synthetic benchmark reports. The spike determines whether either detector is suitable to proceed to the formal Vocal Range Test MVP; it does not implement the formal product UI.

## Scope

The spike includes microphone lifecycle management, one shared PCM frame per A/B observation, note mapping, signal quality classification, stable-note classification, synthetic fixtures, detector/configuration metrics, a minimal debug view, and JSON/text capture export.

It excludes voice-type classification, final results, SEO content, unrelated pitch/tuner tools, accounts, backend services, audio upload, and AI.

## Architecture

`MicrophoneController` owns `MediaStream`, `AudioContext`, and `AnalyserNode`. It produces one timestamped `Float32Array` frame at a requested cadence. `ABRunner` passes that exact array to Pitchy and YIN synchronously, times each detector, maps frequencies to notes, evaluates signal quality, and updates two independent stable-note trackers so detector behavior is comparable.

The detector interface returns frequency, confidence, and detector name without owning capture state. `SignalQualityEvaluator` owns RMS/noise/SNR/clipping state. `StableNoteDetector` consumes elapsed timestamps and quality-qualified readings; it never uses animation frame counts or raw per-frame minima/maxima.

## Configurations

- Pitchy/YIN configuration A: 4096 samples, 50 ms analysis interval (20 Hz).
- Pitchy/YIN configuration B: 8192 samples, 66.67 ms analysis interval (15 Hz).
- Browser capture selects one configuration at a time, but both detectors always receive the same frame.
- The actual `AudioContext.sampleRate` is always used.

## Synthetic Benchmark

Fixtures cover 55, 65.41, 82.41, 110, 196, 440, 880, 1046.5, and 1396.9 Hz at 44.1 and 48 kHz. Variants include sine, harmonic stack, strong second harmonic, vibrato at ±25/50/100 cents, glide, white noise at 30/20/10 dB SNR, 50/60 Hz hum, clipping, and silence.

Each detector/configuration report includes median and P95 absolute cents error, octave-error rate, no-detection rate, and detector processing time p50/p95. Silence contributes to false-detection observations but not cents-error distributions.

## Debug View

The page displays RMS, calibrated noise floor/SNR, clipping, Pitchy and YIN frequency/note/confidence, signal state, stable state/duration/reject reason, and detector time. It includes start/stop, configuration selection, noise calibration, reset, JSON download, and text copy controls. No visual design work beyond readable diagnostic layout is required.

## Error Handling and Privacy

Microphone start requires a user gesture and HTTPS/localhost. Permission denial, unavailable APIs, suspended contexts, hidden pages, and teardown are handled explicitly. Raw audio never leaves the browser and is not included in exports; exports contain aggregate observations and environment metadata only.

## Go/No-Go Boundary

Automated synthetic success is necessary but not sufficient. The spike is only eligible for formal MVP development after real-device tests on iPhone Safari, Android Chrome, Windows Chrome/Edge, and macOS Safari meet the previously agreed accuracy, octave-error, no-detection, stability, and performance gates. Until those captures exist, the outcome remains No-Go for production algorithm approval.
