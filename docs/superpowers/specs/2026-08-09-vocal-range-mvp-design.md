# Vocal Range Test MVP Design

**Status:** Approved design, pending implementation plan  
**Product:** `vocalrangetests.com`  
**Canonical product URL:** `https://vocalrangetests.com/`  
**Visual reference:** [vocal-range-mvp-visual-reference.png](assets/vocal-range-mvp-visual-reference.png)

## 1. Goal

Build a focused, browser-based Vocal Range Test that lets a user authorize the microphone, calibrate the room, sing one lowest comfortable stable note and one highest comfortable stable note, and understand the resulting measured range.

The MVP optimizes for three outcomes:

1. start the test quickly;
2. capture stable human voice endpoints reliably;
3. make the result understandable without requiring music theory knowledge.

The product is not a general music-tool site. It owns one primary demand: `vocal range test`.

## 2. Scope

### Included

- English-only homepage.
- One page-level flow at `/`: `Intro → Calibration → Lowest → Highest → Result`.
- Microphone permission and lifecycle handling.
- Three-second quiet-room noise-floor calibration.
- One successful Lowest capture and one successful Highest capture.
- Pitchy MPM as the production pitch detector.
- Signal-quality, stable-note, tail-stability, and octave-ambiguity validation.
- Lowest note, Highest note, semitone span, decimal octave span, and measured-range visualization.
- A secondary range-overlap estimate with a clear limitation statement.
- Explicit retry and endpoint retest actions.
- Static, crawlable supporting content beneath the tool.
- A separate `/privacy` page.
- Anonymous, allowlisted lifecycle analytics in production only.

### Excluded

- Guitar tuner, generic pitch detector, ear training, voice test variants, or other horizontal tools.
- Requiring three successful repetitions in the consumer flow.
- YIN in the production capture path or production UI.
- Audio recording, audio upload, PCM export, backend storage, accounts, login, sharing, or result URLs.
- AI features or AI-generated interpretations.
- Gender inference or definitive voice-type classification.
- Reference-tone playback, song-based testing, spectrum analyzers, piano keyboards, and tuner needles.
- Blog expansion, keyword-variant pages, testimonials, pricing, ratings, or invented trust claims.

The existing Real Device Validation Harness remains a separate diagnostic product. It keeps Pitchy and YIN same-frame comparison, debug metrics, repeatability testing, and JSON/text export. It must not be converted directly into the consumer homepage.

## 3. Product and SEO Contract

| Field | Decision |
|---|---|
| Page role | Homepage and working browser tool |
| Site type | Single-purpose client-side tool |
| Audience | People who want to measure their comfortable vocal range |
| Primary query | `vocal range test` |
| Search intent | Use a microphone-based tool now |
| Primary outcome | Lowest note, Highest note, measured span, and range-based context |
| Evidence boundary | Browser microphone measurements and documented calculations only |
| Indexable URL | `https://vocalrangetests.com/` |

The homepage title, H1, first-view value proposition, primary action, and static content must all serve the same intent. No result state, query parameter, hash, or session state becomes an independently indexable test URL.

### Homepage metadata

- **Title:** `Vocal Range Test – Find Your Lowest & Highest Notes`
- **Description:** `Sing your lowest and highest comfortable notes using your microphone. See your notes, vocal range in semitones and octaves, and a range-based estimate.`
- **Canonical:** `https://vocalrangetests.com/`
- **Robots:** `index, follow`
- **Language:** `en`

Do not add `free`, `online`, `best`, AI, accuracy, speed, or privacy superlatives to metadata. Open Graph text follows the same factual wording.

### Privacy route

- Serve a real, directly accessible page at `/privacy`.
- Use a self-referencing canonical for `/privacy`.
- Set `noindex, follow`.
- Do not block it in `robots.txt`, because crawlers must be able to read `noindex`.
- Omit it from the XML sitemap.
- Link it from the homepage header/footer and the homepage privacy section.

### Initial HTML

The raw homepage response must contain the title, metadata, one visible H1, value proposition, static supporting sections, and crawlable anchor links. JavaScript enhances only the interactive tool. Tool loading, permission, error, or result states must never remove the static SEO content.

Hash links such as `/#how-it-works` and `/#privacy` are permitted. They are navigation anchors, not separate product or result URLs, and canonical remains `/`.

## 4. Technical Foundation

### Fixed stack

- Vite.
- TypeScript.
- Web Audio API.
- `pitchy@4.1.0`, locked in `package-lock.json`.
- Vitest.
- Client-only execution.

No backend, database, AI service, audio upload, or remote detector is introduced.

### Detector configuration

- Primary detector: Pitchy MPM.
- Frame size: 4096 samples.
- Analysis cadence: 20 Hz.
- Actual `AudioContext.sampleRate` is used at runtime.
- Existing custom YIN remains available only to diagnostic validation and regression tests.

### Production data flow

The production chain is fixed in this order:

```text
Microphone PCM frame
  → raw signal metrics
  → Pitchy MPM
  → SignalQualityEvaluator
      (raw metrics + pitch + clarity)
  → StableNoteDetector
  → tail-stability confirmation
  → octave-ambiguity confirmation
  → accepted endpoint
```

`SignalQualityEvaluator` must evaluate detector output together with raw signal conditions. Stable-note tracking never consumes unqualified pitch frames. A single frame can never become a successful endpoint.

### Main production modules

- `MicrophoneController`: owns `MediaStream`, `AudioContext`, analyser/frame production, and teardown.
- `PitchyMpmAdapter`: returns Pitchy frequency, clarity, and detector timing.
- `SignalQualityEvaluator`: classifies noise, SNR, clipping, pitch validity, and clarity.
- `StableNoteDetector`: tracks time-based stable pitch evidence and resets on invalid signal.
- `EndpointCaptureController`: owns a bounded Lowest or Highest attempt, tail confirmation, ambiguity confirmation, success, and explicit failure.
- `NoteMapper`: maps frequency to fractional MIDI, display MIDI/note, cents, and frequency labels.
- `RangeCalculator`: calculates musical and exact spans and rejects invalid endpoint ordering.
- `RangeOverlapCalculator`: compares the measured endpoints with a versioned, source-documented conventional reference table.
- `VocalRangeTestController`: owns the page-level state machine and view model.
- `Analytics`: exposes only a fixed event allowlist and is disabled outside production.

The diagnostic `ABRunner`, YIN output, Debug View, session exporter, test tags, and tester IDs do not appear in the consumer bundle or interface.

## 5. Page State Machine

### Page-level states

```text
intro
requesting-permission
calibrating
lowest-ready
lowest-capturing
lowest-success
highest-ready
highest-capturing
highest-success
result
recoverable-error
```

The visible page URL remains `/` throughout. Refresh always resets to `intro`; no endpoint or result is restored from `localStorage`, session storage, URL parameters, or browser history state.

### Permanent first-view content

The H1 and value proposition remain visible in every state:

```text
Vocal Range Test

Sing your lowest and highest comfortable notes.
We’ll detect each note and show your range in semitones and octaves.
```

There is exactly one H1. Dynamic step titles use H2.

### Dynamic H2 titles

- Intro: `Ready to find your range?`
- Calibration: `Checking your room`
- Lowest: `Sing your lowest comfortable note`
- Highest: `Sing your highest comfortable note`
- Result: `Your vocal range`

### Intro

Intro explains that the user will sing one comfortable low note and one comfortable high note. It explicitly tells users not to force an extreme. The primary action is `Start Vocal Range Test`.

The user gesture immediately begins the microphone request. The UI must not insert a nonessential screen between the action and the browser permission prompt.

### Calibration

After the microphone becomes available, calibration measures three seconds of quiet-room audio. It does not collect pitch endpoints. The interface asks the user to stay quiet and shows bounded progress.

If calibration is unusably noisy or the audio track ends, show a recoverable explanation and a user-triggered retry. Do not silently repeat calibration forever.

### Lowest and Highest capture

Each endpoint requires one successful capture. A successful capture still requires the complete signal-quality, stable-note, tail-stability, and octave-ambiguity pipeline.

The interface may ask the user to hold a note for about three seconds, but successful capture is determined by evidence, not by requiring a hard-coded full three-second vocal duration. Each attempt has a finite capture timeout held in configuration so the tool cannot listen indefinitely.

On failure:

- stop and discard the current attempt;
- show one clear failure reason;
- provide an explicit `Try again` action;
- never start an invisible retry loop.

On success, show a restrained stable-lock confirmation before proceeding. This feedback confirms accepted measurement; it does not add unverified precision.

### Result

Result shows:

- Lowest note and secondary frequency.
- Highest note and secondary frequency.
- Integer semitone span.
- Decimal octave span.
- `Measured range` visualization.
- Secondary `Range overlap` context.
- `Retest Lowest`, `Retest Highest`, and `Test Again` actions.

`Retest Lowest` and `Retest Highest` reopen the microphone if necessary and always rerun calibration. Browser permission may already be granted, so the copy and implementation must say `reopen microphone`, not promise another browser permission prompt.

After a successful endpoint retest, recompute the whole result using the unchanged opposite endpoint. `Test Again` clears both endpoints and returns to Intro.

## 6. Capture Rules and Failure Copy

### Signal and stability rules

- Low RMS or inadequate SNR cannot enter stable tracking.
- Clipped frames cannot count toward stability.
- Pitch must be within the supported human vocal range.
- Clarity must meet the configured Pitchy quality threshold.
- Stability is calculated from elapsed timestamps, not frame counts.
- A sustained invalid-signal gap clears accumulated stable state.
- Vibrato within the accepted stability envelope may pass.
- Glide or continued terminal drift must fail tail confirmation.
- Sustained octave ambiguity must fail capture.
- Vocal fry is not treated as a reliable shortcut to a lower endpoint.

Threshold values live in a typed configuration module and have regression coverage. They are not scattered through UI code.

### User-facing failure mapping

| Internal condition | User-facing message |
|---|---|
| Signal too quiet / SNR too low | `Sing a little louder or move closer to your microphone.` |
| Clipping | `That was too loud for your microphone. Move back slightly and try again.` |
| No reliable pitch | `We couldn’t detect a clear note. Try an “ah” or “oo” sound.` |
| Excessive drift / glide | `Keep the pitch steadier and try again.` |
| `insufficient-terminal-stability` | `Keep the note steady a little longer.` |
| Octave ambiguity | `We heard an unclear pitch. Try again with a steady, comfortable tone.` |
| Attempt timeout | `We couldn’t lock onto a stable note. Take a breath and try again.` |
| Track ended / device unavailable | `Your microphone stopped. Reopen it to continue.` |
| Permission denied | `Microphone access is needed for this test. Allow access in your browser settings and try again.` |

Messages guide recovery without exposing detector names, thresholds, confidence scores, or debug terminology.

## 7. Result Mathematics

### Note display

For an accepted stable frequency:

```text
fractionalMidi = 69 + 12 × log2(frequencyHz / 440)
displayMidi = round(fractionalMidi)
cents = 100 × (fractionalMidi - displayMidi)
```

The note label is derived from `displayMidi`. Lowest and Highest use the representative accepted stable frequencies, not raw per-frame minima or maxima.

### Musical semitone span

```text
semitoneSpan = highestMidi - lowestMidi
```

Here `highestMidi` and `lowestMidi` are the rounded display MIDI note numbers. This makes the integer span consistent with displayed note labels.

### Decimal octave span

```text
octaveSpan = log2(highestHz / lowestHz)
```

Display with two decimals. This preserves the exact frequency ratio and intentionally may not equal `semitoneSpan / 12` after rounding.

If `highestHz <= lowestHz` or `highestMidi <= lowestMidi`, do not generate a normal result. Explain that the captured high note was not above the captured low note and offer endpoint retest actions.

### Range overlap

Range overlap is secondary to the measured notes and span. It is not a diagnosis, tessitura measurement, fach assignment, or definitive voice type.

- Do not filter or infer by gender.
- Allow multiple overlapping conventional categories.
- Rank only by documented measured-range overlap, never by an AI score.
- Do not force a category when no meaningful overlap exists.
- State that Highest may include comfortable head voice or falsetto.
- The reference table must be versioned, source-documented, and reviewed before its category names and boundaries are published.
- If the reference table cannot be substantiated, omit named category output rather than inventing a classification.

Required limitation copy:

```text
Your captured range overlaps with these conventional vocal ranges.
This is a range-based estimate, not a definitive voice classification.
```

## 8. Visual and Interaction Design

### Direction

Use the approved light `Acoustic Blueprint` concept as the visual baseline, with approximately 10–15% restrained technical character.

The product should feel like a precise, approachable acoustic measurement tool:

- pale mineral-blue base surface;
- deep navy typography;
- cobalt primary actions;
- restrained saffron endpoint/range accent;
- thin pitch and measurement lines;
- subtle note grid and semitone ticks;
- small monospace readouts for secondary numeric data;
- minimal borders and almost no shadow.

Technology is communicated through measurement precision and interaction feedback, not decoration.

Do not use neon, dark cyberpunk dashboards, large spectrum visualizations, AI gradients, glassmorphism, decorative waveforms, microphone illustrations, piano keyboards, tuner needles, or stock photography.

### Typography

- Use one readable humanist sans-serif family for headings, labels, and body copy.
- Use `ui-monospace` only for compact secondary numeric readouts such as Hz.
- Body copy is normally 15–16 px with a comfortable line length.
- Do not use monospace for instructions or long-form content.

The final implementation must not reproduce mock-only false precision such as `±0.12 Hz` unless a real, defined calculation supports it. The first MVP displays accepted Hz values without an invented uncertainty figure.

### Layout

Desktop uses an asymmetric composition: permanent page identity on the left and the active tool/result surface on the right. The tool remains integrated into the page rather than floating as a generic centered card.

Mobile collapses to a single column:

1. permanent H1 and value proposition;
2. current step or result;
3. measured-range visualization;
4. actions;
5. static content.

The measured-range visualization must reflow without horizontal page scrolling. Mobile reduces labeled tick density while preserving endpoint labels and octave landmarks.

### Stable-lock microinteraction

When an endpoint passes all acceptance checks:

- settle the active pitch line into the accepted endpoint;
- show a compact check plus `Stable note captured`;
- use a short, restrained motion rather than a looping animation;
- announce the same status through `aria-live`;
- show the final state immediately when reduced motion is requested.

The animation is confirmation only. It cannot delay, change, or determine acceptance.

### Tool height and layout stability

Reserve the tool shell against the largest expected Result state:

- initial mobile minimum-height target: approximately 680 px;
- initial desktop minimum-height target: approximately 600 px;
- tune against actual rendered content during implementation;
- never use a fixed height that clips localized, zoomed, or accessibility-sized text.

Keep title, status, measurement, error, and action regions structurally stable between states. SEO content remains mounted below the tool. Target state-transition CLS is at most `0.1`.

### Accessibility

- Move focus to the active H2 on state transitions.
- Use an `aria-live` status region for calibration, capture, rejection, and success.
- Use real buttons for actions and real anchors for page navigation.
- Support the complete flow by keyboard.
- Use visible focus styles and approximately 44 × 44 px minimum touch targets.
- Never use color as the only progress, failure, or success cue.
- Respect `prefers-reduced-motion`.
- Keep the complete textual result outside the visualization; the graphic is supplementary.

## 9. Static Homepage Content

The tool is immediately available in the first view. Supporting content appears below it in this order:

1. `How this vocal range test works`
2. `How to get a more accurate result`
3. `Understanding your vocal range result`
4. `What this test can—and can’t—tell you`
5. `Microphone privacy`
6. `Common questions`

Content must explain:

- use a quiet environment and prefer the built-in microphone;
- Lowest means the lowest comfortable note that can be held steadily;
- Highest means the highest comfortable note and may include natural head voice or falsetto;
- do not strain, force an extreme, or use vocal fry to manufacture a lower result;
- why noise, clipping, breathiness, sliding, or unstable pitch can trigger a retry;
- the difference between displayed semitone span and exact decimal octave span;
- why range overlap is not definitive voice classification;
- microphone audio is processed in-browser and is not saved or uploaded;
- refresh, visibility changes, retries, and retests discard active samples as specified.

The homepage privacy statement is brief and links to `/privacy`. It is published only after production network inspection confirms the claim. FAQ content is visible HTML only; do not add FAQ structured data in the MVP.

## 10. Microphone Lifecycle and Recovery

- Microphone start requires an explicit user gesture.
- Reuse an already granted browser permission when available; do not promise a permission dialog.
- Every completion, cancellation, error, hidden-page transition, and reset path stops all MediaStream tracks and closes or suspends owned Web Audio resources as designed.
- If `document.visibilityState` becomes `hidden`, cancel the active capture, discard its PCM and stable state, and stop the microphone.
- On return, show the same logical endpoint in its ready state. Do not resume recording automatically or combine old and new evidence.
- Browser track-ended events produce a recoverable microphone error.
- Calibration data never contributes to an endpoint.
- Raw PCM exists only in bounded in-memory processing buffers and is never persisted or exported.

## 11. Analytics and Privacy Boundary

Production analytics uses an explicit event allowlist. Candidate events are:

- `test_started`
- `microphone_ready`
- `calibration_completed`
- `capture_succeeded`
- `capture_rejected`
- `result_viewed`
- `retest_started`
- `test_restarted`

Do not send:

- Hz, note, MIDI, cents, Lowest, Highest, span, or range-overlap output;
- PCM, audio, clarity, RMS, SNR, clipping, or detector metrics;
- MediaTrack settings;
- custom User-Agent, device name, tester ID, name, email, or other user-entered identity;
- raw failure metrics or diagnostic exports.

Analytics is disabled in local development, tests, and Preview. Before production release, inspect actual network requests. If the selected analytics implementation cannot meet the allowlist, omit custom analytics from the MVP.

## 12. Testing Strategy

### Unit and state tests

Vitest covers:

- NoteMapper frequency, MIDI, cents, and octave boundaries;
- semitone and decimal-octave calculations;
- invalid `Highest <= Lowest` handling;
- signal-quality and user-message mapping;
- stable duration, signal gaps, vibrato, glide, and terminal drift;
- tail and octave-ambiguity rejection;
- complete state-machine paths and illegal transitions;
- explicit retry behavior and bounded attempts;
- refresh/reset and retest calculations;
- range-overlap ordering, empty output, and caveats;
- microphone teardown on all paths;
- analytics event and property allowlists;
- static markup accessibility and SEO invariants.

The existing synthetic fixture suite remains an algorithm regression gate. It includes low/high target frequencies, harmonic stacks, strong second harmonics, vibrato, glide, SNR levels, hum, clipping, and silence. Passing fixtures does not qualify real microphone behavior by itself.

### Browser integration

With mock or fake media input, verify:

- permission start is tied to the user action;
- calibration precedes endpoint capture;
- failure requires explicit retry;
- successful Lowest and Highest produce Result;
- retest reopens the microphone, recalibrates, and recomputes;
- hidden state cancels and discards an active attempt;
- refresh returns to Intro;
- microphone indicators stop after teardown;
- hash navigation does not create a result URL;
- static content remains present through tool states.

Browser simulation is not real-device evidence.

### Real-device smoke matrix

Before production domain promotion, test at least:

| Platform | Browser | Required checks |
|---|---|---|
| iPhone | Safari | Permission, calibration, both endpoints, retry, retest, hidden-page recovery |
| Android | Chrome | Permission, both endpoints, detector performance, retry, retest |
| Windows | Chrome | Full flow, rejection copy, calculation, teardown |
| Windows | Edge | Full flow and microphone lifecycle |
| macOS | Safari | Permission, full flow, hidden-page recovery |

Each platform performs one normal stable capture, one deliberately failed capture, a full Result flow, one endpoint retest, visibility interruption, refresh, and microphone teardown check. This is a 3–4 person compatibility smoke round, not an immediate 8–12 person accuracy study.

### Performance and UX targets

- Pitchy detector processing P95 below 10 ms on target devices.
- No sustained main-thread stall from the 20 Hz detector loop.
- Production-like mobile LCP target at most 2.5 s.
- INP target at most 200 ms.
- State-transition CLS at most 0.1.
- No horizontal scrolling at representative mobile widths.

These are release targets, not public ranking or product claims.

## 13. Preview and Production Isolation

### Diagnostic project

Keep the existing Vercel `vocalrange-validation-harness` project for diagnostic validation only. It has no production domain, no production analytics, and remains `noindex, nofollow`.

### Consumer project

Create a separate Vercel project for the formal consumer MVP. It contains `/`, `/privacy`, production static content, and allowlisted production analytics. It excludes Debug View, ABRunner UI, YIN UI, tester IDs, and diagnostic export.

### Environment rules

- Local and Preview: `noindex, nofollow`; analytics disabled.
- Production `/`: `index, follow`.
- Production `/privacy`: `noindex, follow`.
- The formal domain is attached only to the consumer project.
- Choose one canonical host for apex/`www`; permanently redirect the other while preserving path and query.
- Preview may use the production canonical but can never be indexable.
- The accepted deployment is immutable and traceable to a release commit and deployment ID.

Promote the exact Preview artifact that passed acceptance. Do not rebuild an untested artifact after approval.

## 14. Release Acceptance

Production promotion requires all of the following:

- automated tests and production build pass;
- `/` and `/privacy` return the intended status, metadata, canonical, and robots values;
- raw homepage HTML contains the H1 and supporting content;
- sitemap contains only `/`;
- Preview is not indexable;
- all target device families can authorize and complete the flow;
- ordinary stable human voice locks without a platform-specific failure pattern;
- there is no systematic octave error on a target platform;
- failure, retry, retest, visibility, refresh, and teardown work as designed;
- detector P95 stays within budget;
- Network inspection confirms that audio and measured voice data do not leave the browser;
- analytics payloads stay within the allowlist;
- accessibility, responsive layout, and layout stability checks pass.

Automated tests alone can never produce a production Go decision.

## 15. No-Go and Rollback Boundaries

Block release or roll back if any of the following occurs:

- iPhone Safari or Android Chrome cannot complete microphone capture;
- the microphone remains active after completion, hiding, cancellation, or reset;
- stable human notes show a platform-specific systematic octave error;
- a single frame, terminal drift, or ambiguous endpoint is accepted;
- retest or visibility recovery combines old and new capture state;
- an invalid endpoint order produces a normal result;
- audio or measured voice data appears in a network request;
- homepage indexation, canonical, HTTPS, or routing is wrong;
- Preview or Diagnostic Harness becomes indexable;
- the user is trapped without a recovery action;
- detector work makes the interface visibly unresponsive.

Vercel rollback returns the production domain to the last verified consumer deployment. Do not modify or overwrite the Diagnostic Harness. Algorithm, threshold, audio-lifecycle, privacy, and indexation defects normally require rollback; minor non-blocking copy or visual defects may be fixed forward.

Because the MVP has no backend, accounts, or database, rollback has no user-data migration requirement.

## 16. Deferred Validation

The algorithm framework is frozen for MVP development, but broader statistical validation is not complete. Launch does not prove universal accuracy, professional voice classification, tessitura, clinical validity, or consistent behavior across every microphone and singing technique.

Post-launch or later validation may expand device and singer coverage, but it must not silently broaden the MVP into adjacent music tools or change the approved consumer flow without a new product decision.

