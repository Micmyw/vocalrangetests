import type {
  VocalRangeTestSnapshot,
  VocalRangeTestViewPort,
} from "./VocalRangeTestController";
import type { EndpointKind } from "./types";

export interface VocalRangeTestViewHandlers {
  onStartTest(): Promise<void>;
  onStartCapture(): void;
  onRetryCapture(): void;
  onReopenMicrophone(): Promise<void>;
  onContinueSuccess(): Promise<void>;
  onRetestEndpoint(endpoint: EndpointKind): Promise<void>;
  onTestAgain(): Promise<void>;
}

export class VocalRangeTestView implements VocalRangeTestViewPort {
  private readonly root: HTMLElement;
  private readonly handlers: VocalRangeTestViewHandlers;
  private lastPhase: VocalRangeTestSnapshot["phase"] | null = null;

  constructor(root: HTMLElement, handlers: VocalRangeTestViewHandlers) {
    this.root = root;
    this.handlers = handlers;
    root.addEventListener("click", this.handleClick);
  }

  render(snapshot: VocalRangeTestSnapshot): void {
    if (snapshot.phase !== this.lastPhase) {
      this.lastPhase = snapshot.phase;
      this.root.innerHTML = buildVocalRangeToolMarkup(snapshot);
      queueMicrotask(() => {
        this.root.querySelector<HTMLElement>("[data-step-heading]")?.focus({ preventScroll: true });
      });
      return;
    }

    setText(this.root, "[data-status]", snapshot.statusMessage);
    setText(this.root, "[data-live]", snapshot.statusMessage);
    const progress = this.root.querySelector<HTMLProgressElement>("[data-stable-progress]");
    if (progress) progress.value = Math.min(progress.max, snapshot.stableDurationMs);
    const calibration = this.root.querySelector<HTMLProgressElement>("[data-calibration-progress]");
    if (calibration && snapshot.calibrationRemainingMs !== null) {
      calibration.value = 3_000 - snapshot.calibrationRemainingMs;
    }
  }

  private readonly handleClick = (event: Event): void => {
    const target = event.target instanceof Element
      ? event.target.closest<HTMLButtonElement>("button[data-action]")
      : null;
    if (!target || !this.root.contains(target) || target.disabled) return;
    target.disabled = true;
    const action = target.dataset.action;
    const result = (() => {
      switch (action) {
        case "start-test": return this.handlers.onStartTest();
        case "start-capture": return this.handlers.onStartCapture();
        case "retry-capture": return this.handlers.onRetryCapture();
        case "reopen-microphone": return this.handlers.onReopenMicrophone();
        case "continue-success": return this.handlers.onContinueSuccess();
        case "retest-lowest": return this.handlers.onRetestEndpoint("lowest");
        case "retest-highest": return this.handlers.onRetestEndpoint("highest");
        case "test-again": return this.handlers.onTestAgain();
        default: return undefined;
      }
    })();
    void Promise.resolve(result).catch(() => {
      target.disabled = false;
    });
  };
}

export function buildVocalRangeToolMarkup(snapshot: VocalRangeTestSnapshot): string {
  const content = snapshot.phase === "result" && snapshot.result
    ? resultMarkup(snapshot)
    : snapshot.phase === "intro"
      ? introMarkup()
      : snapshot.phase === "requesting-permission" || snapshot.phase === "calibrating"
        ? calibrationMarkup(snapshot)
        : snapshot.phase === "recoverable-error"
          ? errorMarkup(snapshot)
          : snapshot.phase.endsWith("-success")
            ? successMarkup(snapshot)
            : endpointMarkup(snapshot);

  return `
    <div class="tool-stage tool-stage--${snapshot.phase}">
      ${stepProgress(snapshot)}
      <div class="tool-stage__content">${content}</div>
      <p class="sr-only" aria-live="polite" aria-atomic="true" data-live>${escapeHtml(snapshot.statusMessage)}</p>
    </div>
  `;
}

function introMarkup(): string {
  return `
    <section class="intro-state">
      <p class="eyebrow">MICROPHONE-BASED MEASUREMENT</p>
      <h2 tabindex="-1" data-step-heading>Ready to find your range?</h2>
      <p class="state-lede">You’ll sing one comfortable low note and one comfortable high note. Choose notes you can hold steadily—don’t force an extreme.</p>
      <ul class="quiet-list" aria-label="Before you start">
        <li><i class="ph ph-check-circle" aria-hidden="true"></i> Find a quiet place</li>
        <li><i class="ph ph-check-circle" aria-hidden="true"></i> Use your built-in microphone</li>
        <li><i class="ph ph-check-circle" aria-hidden="true"></i> Sing an “ah” or “oo” sound</li>
      </ul>
      <button class="button button--primary" type="button" data-action="start-test">
        Start Vocal Range Test
        <i class="ph ph-arrow-right" aria-hidden="true"></i>
      </button>
      <p class="microcopy"><i class="ph ph-lock-key" aria-hidden="true"></i> Microphone audio is analyzed in your browser and is not saved or uploaded.</p>
    </section>
  `;
}

function calibrationMarkup(snapshot: VocalRangeTestSnapshot): string {
  const requesting = snapshot.phase === "requesting-permission";
  const progress = snapshot.calibrationRemainingMs === null
    ? 0
    : 3_000 - snapshot.calibrationRemainingMs;
  return `
    <section class="calibration-state">
      <p class="eyebrow">ROOM CHECK</p>
      <h2 tabindex="-1" data-step-heading>Checking your room</h2>
      <div class="listening-orbit${requesting ? " is-waiting" : ""}" aria-hidden="true">
        <i class="ph ph-waveform"></i>
      </div>
      <p class="state-lede">${requesting
        ? "Allow microphone access in your browser to continue."
        : "Stay quiet for a moment while we measure the background noise."}</p>
      <progress data-calibration-progress max="3000" value="${progress}" aria-label="Room calibration progress"></progress>
      <p class="tool-status" data-status>${escapeHtml(snapshot.statusMessage)}</p>
    </section>
  `;
}

function endpointMarkup(snapshot: VocalRangeTestSnapshot): string {
  const endpoint = snapshot.activeEndpoint ?? "lowest";
  const capturing = snapshot.phase.endsWith("-capturing");
  return `
    <section class="endpoint-state endpoint-state--${endpoint}">
      <p class="eyebrow">${endpoint === "lowest" ? "LOW ENDPOINT" : "HIGH ENDPOINT"}</p>
      <h2 tabindex="-1" data-step-heading>Sing your ${endpoint} comfortable note</h2>
      <p class="state-lede">${endpoint === "lowest"
        ? "Slide down gently, then settle on the lowest note that still feels comfortable."
        : "Slide up gently, then settle on the highest comfortable note. Head voice or falsetto is okay."}</p>
      <div class="capture-readout${capturing ? " is-listening" : ""}">
        <span class="capture-readout__label">${capturing ? "Listening" : "Ready"}</span>
        <span class="capture-readout__line" aria-hidden="true"></span>
        <span class="capture-readout__hint">Hold it steadily for about 3 seconds</span>
      </div>
      <progress data-stable-progress max="1400" value="${Math.min(1_400, snapshot.stableDurationMs)}" aria-label="Stable note progress"></progress>
      <p class="tool-status" data-status>${escapeHtml(snapshot.statusMessage)}</p>
      ${capturing ? `
        <p class="listening-label"><i class="ph ph-waveform" aria-hidden="true"></i> Listening for a stable pitch…</p>
      ` : `
        <button class="button button--primary" type="button" data-action="start-capture">
          Start listening <i class="ph ph-microphone" aria-hidden="true"></i>
        </button>
      `}
    </section>
  `;
}

function successMarkup(snapshot: VocalRangeTestSnapshot): string {
  const endpoint = snapshot.activeEndpoint ?? "lowest";
  const captured = endpoint === "lowest" ? snapshot.lowest : snapshot.highest;
  return `
    <section class="success-state">
      <p class="eyebrow">${endpoint.toUpperCase()} ENDPOINT</p>
      <h2 tabindex="-1" data-step-heading>${endpoint === "lowest" ? "Lowest" : "Highest"} note captured</h2>
      <div class="stable-lock" role="status">
        <i class="ph ph-check-circle" aria-hidden="true"></i>
        <span>Stable note captured</span>
        <span class="stable-lock__line" aria-hidden="true"></span>
      </div>
      <p class="captured-note">${escapeHtml(captured?.note ?? "—")}</p>
      <p class="numeric-readout">${captured ? captured.frequencyHz.toFixed(2) : "—"} Hz</p>
      <button class="button button--primary" type="button" data-action="continue-success">
        ${endpoint === "lowest" && snapshot.highest === null ? "Continue to highest" : "See my range"}
        <i class="ph ph-arrow-right" aria-hidden="true"></i>
      </button>
    </section>
  `;
}

function errorMarkup(snapshot: VocalRangeTestSnapshot): string {
  const microphoneRecovery = snapshot.recoveryAction === "reopen-microphone";
  const title = microphoneRecovery
    ? "Microphone access needed"
    : snapshot.activeEndpoint
      ? `Try your ${snapshot.activeEndpoint} note again`
      : "Try that step again";
  const action = !microphoneRecovery
    ? { id: "retry-capture", label: "Try again" }
    : { id: "reopen-microphone", label: "Reopen microphone" };
  return `
    <section class="error-state">
      <p class="eyebrow">${microphoneRecovery ? "MICROPHONE CHECK" : "LET’S RESET"}</p>
      <h2 tabindex="-1" data-step-heading>${title}</h2>
      <div class="notice notice--error">
        <i class="ph ph-warning-circle" aria-hidden="true"></i>
        <p>${escapeHtml(snapshot.errorMessage ?? "We couldn’t complete that step.")}</p>
      </div>
      <button class="button button--primary" type="button" data-action="${action.id}">${action.label}</button>
      <p class="tool-status" data-status>${escapeHtml(snapshot.statusMessage)}</p>
    </section>
  `;
}

function resultMarkup(snapshot: VocalRangeTestSnapshot): string {
  const result = snapshot.result!;
  const overlapText = snapshot.overlaps.length > 0
    ? snapshot.overlaps.map((item) => `<li>${escapeHtml(item.label)}</li>`).join("")
    : "<li>No close reference-range overlap</li>";
  return `
    <section class="result-state">
      <p class="eyebrow">MEASUREMENT COMPLETE</p>
      <h2 tabindex="-1" data-step-heading>Your vocal range</h2>
      <div class="result-summary" aria-label="Vocal range result">
        ${endpointResult("Lowest note", result.lowest)}
        ${endpointResult("Highest note", result.highest)}
        <div class="span-result">
          <span class="sr-only">${result.semitoneSpan} semitones · ${result.octaveSpan.toFixed(2)} octaves</span>
          <span><strong>${result.semitoneSpan}</strong> semitones</span>
          <span><strong>${result.octaveSpan.toFixed(2)}</strong> octaves</span>
          <span class="span-result__label">Total range</span>
        </div>
      </div>
      ${measuredRangeMarkup(result.lowest.midi, result.highest.midi, result.lowest.note, result.highest.note)}
      <div class="range-overlap">
        <div class="range-overlap__title"><i class="ph ph-info" aria-hidden="true"></i><h3>Range overlap</h3></div>
        <ul class="overlap-list">${overlapText}</ul>
        <p>Your captured range overlaps with these conventional vocal ranges. This is a range-based estimate, not a definitive voice classification. A comfortable head voice or falsetto may be included.</p>
      </div>
      <div class="result-actions">
        <button class="button button--primary" type="button" data-action="test-again">Test Again</button>
        <button class="button button--quiet" type="button" data-action="retest-lowest">Retest Lowest</button>
        <button class="button button--quiet" type="button" data-action="retest-highest">Retest Highest</button>
      </div>
    </section>
  `;
}

function endpointResult(label: string, endpoint: NonNullable<VocalRangeTestSnapshot["lowest"]>): string {
  return `
    <div class="endpoint-result">
      <strong class="endpoint-result__note">${escapeHtml(endpoint.note)}</strong>
      <span class="endpoint-result__label">${label}</span>
      <div class="endpoint-result__reading">
        <span class="numeric-readout">${endpoint.frequencyHz.toFixed(2)} Hz</span>
        <span class="stable-chip"><i class="ph ph-check-circle" aria-hidden="true"></i> Stable lock</span>
      </div>
    </div>
  `;
}

function measuredRangeMarkup(
  lowestMidi: number,
  highestMidi: number,
  lowestNote: string,
  highestNote: string,
): string {
  let scaleLow = Math.floor(lowestMidi / 12) * 12;
  let scaleHigh = Math.ceil(highestMidi / 12) * 12;
  while (scaleHigh - scaleLow < 24) {
    scaleLow -= 12;
    scaleHigh += 12;
  }
  const span = scaleHigh - scaleLow;
  const start = ((lowestMidi - scaleLow) / span) * 100;
  const end = ((highestMidi - scaleLow) / span) * 100;
  const ticks = Array.from({ length: span + 1 }, (_, index) =>
    `<span class="range-tick${index % 12 === 0 ? " range-tick--octave" : ""}" style="left:${(index / span) * 100}%"></span>`,
  ).join("");
  const octaveLabels: string[] = [];
  const frequencyLabels: string[] = [];
  for (let midi = scaleLow; midi <= scaleHigh; midi += 12) {
    const left = ((midi - scaleLow) / span) * 100;
    const frequencyHz = Math.round(440 * 2 ** ((midi - 69) / 12));
    octaveLabels.push(`<span style="left:${left}%">C${Math.floor(midi / 12) - 1}</span>`);
    frequencyLabels.push(`<span style="left:${left}%">${frequencyHz} Hz</span>`);
  }
  return `
    <section class="measured-range-section" aria-labelledby="measured-range-title">
      <h3 id="measured-range-title">Measured range</h3>
      <div class="measured-range" role="img" aria-label="Measured range from ${escapeHtml(lowestNote)} to ${escapeHtml(highestNote)}" style="--range-start:${start}%;--range-end:${end}%">
        <div class="octave-labels" aria-hidden="true">${octaveLabels.join("")}</div>
        <div class="range-grid" aria-hidden="true">${ticks}</div>
        <span class="measured-range__span" aria-hidden="true"></span>
        <span class="range-endpoint range-endpoint--low" aria-hidden="true"><b>${escapeHtml(lowestNote)}</b></span>
        <span class="range-endpoint range-endpoint--high" aria-hidden="true"><b>${escapeHtml(highestNote)}</b></span>
        <div class="frequency-labels" aria-hidden="true">${frequencyLabels.join("")}</div>
      </div>
      <p class="range-caption">The highlighted span shows the lowest and highest notes you reached.</p>
    </section>
  `;
}

function stepProgress(snapshot: VocalRangeTestSnapshot): string {
  if (snapshot.phase === "intro") return "";
  const lowestDone = snapshot.lowest !== null;
  const highestDone = snapshot.highest !== null;
  const microphoneRecovery = snapshot.recoveryAction === "reopen-microphone";
  const roomState = snapshot.phase === "requesting-permission" ||
    snapshot.phase === "calibrating" ||
    microphoneRecovery
    ? "current"
    : "complete";
  return `
    <ol class="tool-steps" aria-label="Test progress">
      ${step("Room", roomState)}
      ${step(
        "Lowest",
        lowestDone ? "complete" : !microphoneRecovery && snapshot.activeEndpoint === "lowest" ? "current" : "upcoming",
        lowestDone ? `Detected: ${snapshot.lowest!.note}` : undefined,
      )}
      ${step(
        "Highest",
        highestDone ? "complete" : !microphoneRecovery && snapshot.activeEndpoint === "highest" ? "current" : "upcoming",
        highestDone ? `Detected: ${snapshot.highest!.note}` : undefined,
      )}
    </ol>
  `;
}

function step(
  label: string,
  state: "complete" | "current" | "upcoming",
  detail: string = state,
): string {
  return `<li data-state="${state}">${state === "complete" ? '<i class="ph ph-check" aria-hidden="true"></i>' : ""}<span>${label}</span><small>${escapeHtml(detail)}</small></li>`;
}

function setText(root: ParentNode, selector: string, value: string): void {
  const element = root.querySelector(selector);
  if (element) element.textContent = value;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
