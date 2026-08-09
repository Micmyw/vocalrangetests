# Vocal Range Real Device Validation Harness

Browser-only validation harness for comparing `pitchy@4.1.0` MPM with the same-frame range-limited YIN implementation. This remains diagnostic software, not the public Vocal Range Test product.

## Run locally

```powershell
npm ci
npm run dev
```

Microphone access requires localhost or trusted HTTPS. A phone cannot normally authorize the microphone from a plain `http://<LAN-IP>` address.

## Unified tester instructions

- Use a quiet room.
- Prefer the built-in microphone.
- Lowest means the lowest comfortable note you can hold steadily.
- Highest means the highest comfortable note you can hold steadily.
- Hold each note for about three seconds.
- Do not force an extreme note.

The harness requests microphone permission, measures the room noise floor for three seconds, then collects three successful Lowest and three successful Highest Pitchy captures. Failed windows remain in the session and count as retries. Attempt tags are `modal`, `head-falsetto`, `breathy`, `vibrato`, `glide`, and `fry`.

Pitchy and YIN always receive the exact same PCM frame. The fixed real-device candidate is 4096 samples at 20 Hz; there is no 8192 configuration in this flow.

## Privacy and export

JSON and text exports contain an anonymous tester ID, browser/device environment, sample rate, track settings, signal diagnostics, detector readings, endpoint repeatability, and session metrics.

The harness does not request or retain a name or email. It does not record or export PCM/audio, use localStorage, send analytics, or call a backend.

## Validation commands

```powershell
npm test
npm run benchmark
npm run build
```

Automated simulation and browser-injected MediaStreams validate the harness only. They do not count toward the 3–4 person Smoke Test or authorize formal MVP development.
