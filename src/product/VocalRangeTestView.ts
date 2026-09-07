import type {
  VocalRangeTestSnapshot,
  VocalRangeTestViewPort,
} from "./VocalRangeTestController";
import type { EndpointKind } from "./types";
import { PRODUCT_AUDIO_CONFIG } from "./ProductConfig";

export interface VocalRangeTestViewHandlers {
  onStartTest(): Promise<void>;
  onStartCapture(): void;
  onRetryCapture(): void;
  onReopenMicrophone(): Promise<void>;
  onContinueSuccess(): Promise<void>;
  onRetestEndpoint(endpoint: EndpointKind): Promise<void>;
  onTestAgain(): Promise<void>;
  onStopTest(): Promise<void>;
  onCancelRetest(): Promise<void>;
}

export class VocalRangeTestView implements VocalRangeTestViewPort {
  private readonly root: HTMLElement;
  private readonly handlers: VocalRangeTestViewHandlers;
  private lastPhase: VocalRangeTestSnapshot["phase"] | null = null;
  private lastAnnouncedStatus = "";
  private lastAnnouncementAtMs = Number.NEGATIVE_INFINITY;

  constructor(root: HTMLElement, handlers: VocalRangeTestViewHandlers) {
    this.root = root;
    this.handlers = handlers;
    root.addEventListener("click", this.handleClick);
  }

  render(snapshot: VocalRangeTestSnapshot): void {
    if (snapshot.phase !== this.lastPhase) {
      const isInitialRender = this.lastPhase === null;
      this.lastPhase = snapshot.phase;
      this.lastAnnouncedStatus = snapshot.statusMessage;
      this.lastAnnouncementAtMs = Date.now();
      this.root.innerHTML = buildVocalRangeToolMarkup(snapshot);
      if (!isInitialRender) {
        queueMicrotask(() => {
          this.root.querySelector<HTMLElement>("[data-step-heading]")?.focus();
        });
      }
      return;
    }

    setText(this.root, "[data-status]", snapshot.statusMessage);
    this.announceStatus(snapshot.statusMessage);
    setText(this.root, "[data-current-note]", snapshot.currentNote ?? "—");
    const progress = this.root.querySelector<HTMLProgressElement>("[data-stable-progress]");
    if (progress) progress.value = Math.round(clamp01(snapshot.stableProgressRatio) * 100);
    const meter = this.root.querySelector<HTMLElement>("[data-input-meter]");
    if (meter) {
      const level = clamp01(snapshot.inputLevel);
      meter.dataset.level = String(level);
      meter.setAttribute("aria-valuenow", String(Math.round(level * 100)));
      meter.style.setProperty("--input-level", `${Math.round(level * 100)}%`);
    }
    const staff = this.root.querySelector<HTMLElement>("[data-breath-staff]");
    if (staff) {
      staff.style.setProperty("--input-level", `${Math.round(clamp01(snapshot.inputLevel) * 100)}%`);
      staff.style.setProperty("--stability", `${Math.round(clamp01(snapshot.stableProgressRatio) * 100)}%`);
    }
    const calibration = this.root.querySelector<HTMLProgressElement>("[data-calibration-progress]");
    if (calibration && snapshot.calibrationRemainingMs !== null) {
      calibration.value = PRODUCT_AUDIO_CONFIG.calibrationMs - snapshot.calibrationRemainingMs;
    }
  }

  private announceStatus(status: string): void {
    if (status === this.lastAnnouncedStatus) return;
    const now = Date.now();
    if (now - this.lastAnnouncementAtMs < 1_000) return;
    setText(this.root, "[data-live]", status);
    this.lastAnnouncedStatus = status;
    this.lastAnnouncementAtMs = now;
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
        case "stop-test": return this.handlers.onStopTest();
        case "cancel-retest": return this.handlers.onCancelRetest();
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
      ${toolToolbar(snapshot)}
      ${stepProgress(snapshot)}
      ${breathStaffMarkup(snapshot)}
      <div class="tool-stage__content">${content}</div>
      <p class="sr-only" aria-live="polite" aria-atomic="true" data-live>${escapeHtml(snapshot.statusMessage)}</p>
    </div>
  `;
}

function toolToolbar(snapshot: VocalRangeTestSnapshot): string {
  const testActive = snapshot.phase !== "intro" && snapshot.phase !== "result";
  const retestActive = testActive && snapshot.result !== null;
  const microphoneLabel = snapshot.microphoneActive
    ? "Microphone on"
    : snapshot.phase === "requesting-permission"
      ? "Waiting for access"
      : "Microphone off";
  return `
    <div class="tool-toolbar">
      <span class="tool-toolbar__label"><i class="ph ph-waveform" aria-hidden="true"></i> Voice range instrument</span>
      <div class="tool-toolbar__controls">
        <span class="microphone-state${snapshot.microphoneActive ? " is-on" : ""}">
          <span aria-hidden="true"></span>${microphoneLabel}
        </span>
        ${retestActive
          ? `<button class="button button--stop" type="button" data-action="cancel-retest"><i class="ph ph-arrow-left" aria-hidden="true"></i> Back to result</button>`
          : testActive ? `<button class="button button--stop" type="button" data-action="stop-test"><i class="ph ph-stop-circle" aria-hidden="true"></i> Stop test</button>` : ""}
      </div>
    </div>
  `;
}

function breathStaffMarkup(snapshot: VocalRangeTestSnapshot): string {
  const capturing = snapshot.phase.endsWith("-capturing");
  const inputLevel = clamp01(snapshot.inputLevel);
  const stability = clamp01(snapshot.stableProgressRatio);
  const currentNote = snapshot.currentNote ?? "—";
  const lowMarker = snapshot.lowest
    ? `<span class="staff-note staff-note--low"><i aria-hidden="true"></i><b>${escapeHtml(snapshot.lowest.note)}</b><small>Low</small></span>`
    : "";
  const highMarker = snapshot.highest
    ? `<span class="staff-note staff-note--high"><i aria-hidden="true"></i><b>${escapeHtml(snapshot.highest.note)}</b><small>High</small></span>`
    : "";
  return `
    <section class="breath-staff" data-breath-staff aria-label="${capturing ? "Live pitch feedback" : "Vocal range staff"}" style="--input-level:${capturing ? Math.round(inputLevel * 100) : 0}%;--stability:${capturing ? Math.round(stability * 100) : 0}%">
      <div class="breath-staff__field" aria-hidden="true">
        <span class="breath-staff__signal"></span>
        ${lowMarker}${highMarker}
      </div>
      ${capturing ? `<div class="staff-readouts">
        <div class="staff-readout staff-readout--note">
          <span>Current note</span>
          <strong data-current-note>${escapeHtml(currentNote)}</strong>
        </div>
        <div class="staff-readout">
          <span>Input level</span>
          <div class="input-meter" role="progressbar" aria-label="Microphone input level" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(inputLevel * 100)}" data-input-meter data-level="${inputLevel}">
            <i aria-hidden="true"></i>
          </div>
        </div>
        <div class="staff-readout">
          <span>Pitch stability</span>
          <progress data-stable-progress max="100" value="${Math.round(stability * 100)}" aria-label="Pitch stability progress"></progress>
        </div>
      </div>` : staffSummaryMarkup(snapshot)}
    </section>
  `;
}

function staffSummaryMarkup(snapshot: VocalRangeTestSnapshot): string {
  const items = staffSummary(snapshot);
  return `<div class="staff-readouts staff-readouts--summary">${items.map(({ label, value }) => `
    <div class="staff-readout">
      <span>${label}</span>
      <strong>${escapeHtml(value)}</strong>
    </div>
  `).join("")}</div>`;
}

function staffSummary(snapshot: VocalRangeTestSnapshot): Array<{ label: string; value: string }> {
  if (snapshot.phase === "result" && snapshot.result) {
    return [
      { label: "Lowest", value: snapshot.result.lowest.note },
      { label: "Highest", value: snapshot.result.highest.note },
      { label: "Total range", value: `${snapshot.result.semitoneSpan} semitones` },
    ];
  }
  if (snapshot.phase.endsWith("-success")) {
    const captured = snapshot.activeEndpoint === "highest" ? snapshot.highest : snapshot.lowest;
    return [
      { label: "Captured", value: captured?.note ?? "—" },
      { label: "Status", value: "Stable" },
      { label: "Next", value: snapshot.activeEndpoint === "lowest" && snapshot.highest === null ? "Highest note" : "View result" },
    ];
  }
  if (snapshot.phase === "requesting-permission" || snapshot.phase === "calibrating") {
    return [
      { label: "Room check", value: snapshot.phase === "requesting-permission" ? "Permission" : "Listening" },
      { label: "Microphone", value: snapshot.microphoneActive ? "On" : "Waiting" },
      { label: "Next", value: `${snapshot.activeEndpoint ?? "lowest"} note` },
    ];
  }
  if (snapshot.phase.endsWith("-ready")) {
    return [
      { label: "Target", value: `${snapshot.activeEndpoint ?? "lowest"} note` },
      { label: "Microphone", value: snapshot.microphoneActive ? "On" : "Off" },
      { label: "Next", value: "Start listening" },
    ];
  }
  if (snapshot.phase === "recoverable-error") {
    return [
      { label: "Capture", value: "Paused" },
      { label: "Microphone", value: snapshot.microphoneActive ? "On" : "Off" },
      { label: "Next", value: snapshot.recoveryAction === "reopen-microphone" ? "Reconnect" : "Try again" },
    ];
  }
  return [
    { label: "Microphone", value: "Off" },
    { label: "Process", value: "Two notes" },
    { label: "Result", value: "Your range" },
  ];
}

function introMarkup(): string {
  return `
    <section class="intro-state">
      <p class="eyebrow">PRIVATE · IN-BROWSER · NO SIGN-UP</p>
      <h2 tabindex="-1" data-step-heading>Ready to find your range?</h2>
      <p class="state-lede">Sing one comfortable low note and one comfortable high note. We’ll listen for a steady pitch and map the distance between them.</p>
      <ul class="quiet-list" aria-label="Before you start">
        <li><i class="ph ph-check-circle" aria-hidden="true"></i> Find a quiet place</li>
        <li><i class="ph ph-check-circle" aria-hidden="true"></i> Use your built-in microphone</li>
        <li><i class="ph ph-check-circle" aria-hidden="true"></i> Stay comfortable—don’t force an extreme</li>
      </ul>
      <button class="button button--primary" type="button" data-action="start-test">
        Start Vocal Range Test
        <i class="ph ph-arrow-right" aria-hidden="true"></i>
      </button>
      <p class="microcopy"><i class="ph ph-lock-key" aria-hidden="true"></i> Your audio stays on this device. The microphone turns off when you finish or stop the test.</p>
    </section>
  `;
}

function calibrationMarkup(snapshot: VocalRangeTestSnapshot): string {
  const requesting = snapshot.phase === "requesting-permission";
  const progress = snapshot.calibrationRemainingMs === null
    ? 0
    : PRODUCT_AUDIO_CONFIG.calibrationMs - snapshot.calibrationRemainingMs;
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
      <progress data-calibration-progress max="${PRODUCT_AUDIO_CONFIG.calibrationMs}" value="${progress}" aria-label="Room calibration progress"></progress>
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
      <p class="tool-status" data-status>${escapeHtml(snapshot.statusMessage)}</p>
      ${capturing ? `
        <p class="listening-label"><i class="ph ph-waveform" aria-hidden="true"></i> Listening — hold the note as the stability bar fills.</p>
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
      <div class="notice notice--error" role="alert">
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
  if (lowestMidi === scaleLow) scaleLow -= 12;
  if (highestMidi === scaleHigh) scaleHigh += 12;
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
  const roomActive = snapshot.phase === "requesting-permission" ||
    snapshot.phase === "calibrating" ||
    microphoneRecovery;
  const endpointInProgress = !roomActive && !snapshot.phase.endsWith("-success") && snapshot.phase !== "result";
  const roomState = roomActive ? "current" : "complete";
  return `
    <ol class="tool-steps" aria-label="Test progress">
      ${step("Room", roomState)}
      ${step(
        "Lowest",
        !microphoneRecovery && endpointInProgress && snapshot.activeEndpoint === "lowest"
          ? "current"
          : lowestDone ? "complete" : "upcoming",
        lowestDone ? `Detected: ${snapshot.lowest!.note}` : undefined,
      )}
      ${step(
        "Highest",
        !microphoneRecovery && endpointInProgress && snapshot.activeEndpoint === "highest"
          ? "current"
          : highestDone ? "complete" : "upcoming",
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
  const current = state === "current" ? ' aria-current="step"' : "";
  return `<li data-state="${state}"${current}><span>${label}</span><small>${escapeHtml(detail)}</small></li>`;
}

function setText(root: ParentNode, selector: string, value: string): void {
  const element = root.querySelector(selector);
  if (element && element.textContent !== value) element.textContent = value;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
