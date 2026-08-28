# Vocal Range Test – Find Your Lowest and Highest Notes Online

**Live website:** [Vocal Range Test](https://vocalrangetests.com/)

Vocal Range Test is a free online voice range finder for singers. Use your microphone to capture your lowest and highest comfortable notes, then see your measured vocal range in note names, semitones, and octaves. The result also shows overlap with conventional vocal ranges as helpful context—not as a definitive voice classification.

No download, account, or audio upload is required. The test runs directly in a modern web browser.

## Try the free vocal range test

Visit **[vocalrangetests.com](https://vocalrangetests.com/)**, allow microphone access, and follow four short steps:

1. Stay quiet for a three-second room-noise check.
2. Sing the lowest comfortable note you can hold steadily.
3. Sing your highest comfortable stable note; head voice or falsetto is okay.
4. View your lowest note, highest note, semitone span, octave span, and range-overlap estimate.

For a more reliable result, use a quiet room and your device's built-in microphone. Hold each note steadily without forcing an extreme pitch or dropping into vocal fry.

## Features

- Free browser-based vocal range test
- Automatic pitch and musical note detection
- Lowest and highest comfortable note capture
- Vocal range calculation in semitones and octaves
- Visual measured-range display
- Comparison with conventional bass, baritone, tenor, countertenor, contralto, mezzo-soprano, and soprano ranges
- Individual low-note and high-note retesting
- Clear guidance for weak, unstable, clipped, or ambiguous signals
- Responsive experience for desktop and mobile browsers

## What the result means

This singing range test measures the distance between two stable notes captured during the current session. It can help you explore your vocal range, track changes, or choose songs that better match the notes you can comfortably reach.

The result is not a medical assessment or a professional voice-type diagnosis. Vocal range alone cannot determine tessitura, vocal weight, passaggi, training level, fach, or definitive voice type. Warm-up, technique, health, microphone processing, and the use of head voice or falsetto can all affect the measured endpoints.

## Microphone privacy

Microphone audio is analyzed locally in the browser. The site does not record, save, upload, or export the audio used for the test. Production analytics may collect anonymous page and test-lifecycle events, but not notes, frequencies, vocal-range results, audio, or microphone settings.

Read the full [Vocal Range Test Privacy Policy](https://vocalrangetests.com/privacy).

## Technology

The application is built with TypeScript, Vite, the Web Audio API, and `pitchy`'s McLeod Pitch Method implementation. Signal-quality checks, stable-note detection, and endpoint validation help reject noise, clipping, unstable pitches, and possible octave ambiguity.

## Run locally

```powershell
npm ci
npm run dev
```

Microphone access requires `localhost` or trusted HTTPS. A phone cannot normally authorize microphone access from a plain `http://<LAN-IP>` address.

## Validation

```powershell
npm test
npm run benchmark
npm run build
```

The repository also includes a real-device validation harness for comparing pitch-detection behavior. Automated simulations and browser-injected media streams validate the implementation but do not replace testing with real voices and microphones.
