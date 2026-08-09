import type { MicrophoneFrameInfo } from "../audio/MicrophoneController";
import type { ABObservation } from "../dsp/ABRunner";
import type {
  ValidationFlowSnapshot,
  ValidationHarnessViewPort,
} from "../validation/ValidationHarnessController";
import type {
  AttemptResult,
  DeviceEnvironment,
  PhonationTag,
  ValidationSessionSummary,
} from "../validation/types";
import { PHONATION_TAGS } from "../validation/types";
import { buildDebugSnapshot, type DebugSnapshot } from "./DebugView";

export interface ValidationHarnessViewHandlers {
  onStartSession: (testerId: string) => Promise<void>;
  onStartAttempt: (tags: PhonationTag[]) => void;
  onStop: () => Promise<void>;
  onDownload: () => void;
  onCopy: () => Promise<void>;
}

export function buildValidationHarnessMarkup(defaultTesterId: string): string {
  return `
    <section class="spike-shell">
      <h1>Real Device Validation Harness</h1>
      <p class="warning">Diagnostic validation only. This is not the final Vocal Range Test.</p>

      <section class="instructions" aria-labelledby="instructions-title">
        <h2 id="instructions-title">Unified tester instructions</h2>
        <ul>
          <li>Use a quiet room.</li>
          <li>Prefer the built-in microphone.</li>
          <li>Lowest means the lowest comfortable note you can hold steadily.</li>
          <li>Highest means the highest comfortable note you can hold steadily.</li>
          <li>Hold each note for about 3 seconds.</li>
          <li>Do not force an extreme note.</li>
        </ul>
      </section>

      <div class="setup-grid">
        <label>Anonymous tester ID
          <input id="tester-id" type="text" maxlength="40" autocomplete="off" spellcheck="false" value="${escapeHtml(defaultTesterId)}" />
        </label>
        <div class="environment breakable" aria-label="Detected environment">
          <strong>OS / Browser / Device</strong>
          <span id="environment">Detected after microphone authorization</span>
          <span id="audio-environment">Audio settings pending</span>
        </div>
      </div>

      <fieldset id="tags">
        <legend>Attempt tags (select all that apply)</legend>
        <div class="tag-grid">
          ${PHONATION_TAGS.map((tag, index) => `
            <label><input type="checkbox" value="${tag}" ${index === 0 ? "checked" : ""} /> ${tag}</label>
          `).join("")}
        </div>
      </fieldset>

      <div class="controls">
        <button id="start-session" type="button">Authorize microphone &amp; calibrate</button>
        <button id="start-attempt" type="button" disabled>Start 3-second attempt</button>
        <button id="stop-session" type="button" disabled>Stop session</button>
        <button id="download" type="button" disabled>Download JSON</button>
        <button id="copy" type="button" disabled>Copy result as text</button>
      </div>

      <section class="flow-panel" aria-label="Test progress">
        <p><strong>Phase:</strong> <span id="phase">setup</span></p>
        <p><strong>Current endpoint:</strong> <span id="endpoint">Lowest</span></p>
        <p><strong>Countdown:</strong> <span id="countdown">—</span></p>
        <p><strong>Lowest progress:</strong> <span id="lowest-progress">0 / 3</span></p>
        <p><strong>Highest progress:</strong> <span id="highest-progress">0 / 3</span></p>
        <p><strong>Retry count:</strong> <span id="retry-count">0</span></p>
      </section>

      <p id="status" role="status">Ready to start</p>

      <h2>Live diagnostics</h2>
      <div class="table-scroll">
        <table>
          <tbody>
            ${debugRow("RMS", "rms")}
            ${debugRow("Noise floor / SNR", "noise")}
            ${debugRow("Clipping", "clipping")}
            ${debugRow("Pitchy Hz / note / clarity", "pitchy")}
            ${debugRow("YIN Hz / note / confidence", "yin")}
            ${debugRow("Signal state", "signalState")}
            ${debugRow("Stable state", "stableState")}
            ${debugRow("Stable duration", "stableDuration")}
            ${debugRow("Reject reason", "rejectReason")}
            ${debugRow("Detector processing time", "processingTime")}
          </tbody>
        </table>
      </div>

      <h2>Attempt captures</h2>
      <div class="table-scroll">
        <table>
          <thead><tr><th>Test</th><th>Tags</th><th>Pitchy stable</th><th>YIN stable</th><th>Signal</th></tr></thead>
          <tbody id="attempts"><tr id="no-attempts"><td colspan="5">No attempts yet</td></tr></tbody>
        </table>
      </div>

      <h2>Session Summary</h2>
      <div class="table-scroll">
        <table>
          <tbody>
            ${summaryRow("Pitchy success rate", "pitchy-success")}
            ${summaryRow("YIN success rate", "yin-success")}
            ${summaryRow("No-detection rate", "no-detection")}
            ${summaryRow("Octave ambiguity / disagreement", "octave")}
            ${summaryRow("Retry count", "summary-retries")}
            ${summaryRow("Lowest notes / repeatability", "lowest-summary")}
            ${summaryRow("Highest notes / repeatability", "highest-summary")}
            ${summaryRow("Detector processing p50 / p95", "performance")}
          </tbody>
        </table>
      </div>
    </section>`;
}

export class ValidationHarnessView implements ValidationHarnessViewPort {
  private readonly root: HTMLElement;
  private readonly handlers: ValidationHarnessViewHandlers;
  private readonly debugElements = new Map<keyof DebugSnapshot, HTMLElement>();
  private readonly testerId: HTMLInputElement;
  private readonly startSessionButton: HTMLButtonElement;
  private readonly startAttemptButton: HTMLButtonElement;
  private readonly stopButton: HTMLButtonElement;
  private readonly downloadButton: HTMLButtonElement;
  private readonly copyButton: HTMLButtonElement;
  private readonly tagInputs: NodeListOf<HTMLInputElement>;

  constructor(
    root: HTMLElement,
    handlers: ValidationHarnessViewHandlers,
    defaultTesterId: string,
  ) {
    this.root = root;
    this.handlers = handlers;
    root.innerHTML = buildValidationHarnessMarkup(defaultTesterId);
    this.testerId = requiredElement(root, "#tester-id");
    this.startSessionButton = requiredElement(root, "#start-session");
    this.startAttemptButton = requiredElement(root, "#start-attempt");
    this.stopButton = requiredElement(root, "#stop-session");
    this.downloadButton = requiredElement(root, "#download");
    this.copyButton = requiredElement(root, "#copy");
    this.tagInputs = root.querySelectorAll<HTMLInputElement>("#tags input[type=checkbox]");
    for (const key of [
      "rms", "noise", "clipping", "pitchy", "yin", "signalState",
      "stableState", "stableDuration", "rejectReason", "processingTime",
    ] as (keyof DebugSnapshot)[]) {
      this.debugElements.set(key, requiredElement(root, `[data-field="${key}"]`));
    }

    this.startSessionButton.addEventListener("click", () => {
      void this.handlers.onStartSession(this.testerId.value).catch(() => undefined);
    });
    this.startAttemptButton.addEventListener("click", () =>
      this.handlers.onStartAttempt(this.selectedTags()),
    );
    this.stopButton.addEventListener("click", () => void this.handlers.onStop());
    this.downloadButton.addEventListener("click", this.handlers.onDownload);
    this.copyButton.addEventListener("click", () => void this.handlers.onCopy());
  }

  renderFlow(snapshot: ValidationFlowSnapshot): void {
    setText(this.root, "#phase", snapshot.phase);
    setText(this.root, "#endpoint", capitalize(snapshot.endpoint));
    setText(this.root, "#countdown", snapshot.remainingMs === null
      ? "—"
      : `${(snapshot.remainingMs / 1000).toFixed(1)} s`);
    setText(this.root, "#lowest-progress", `${snapshot.lowestSuccesses} / ${snapshot.requiredPerEndpoint}`);
    setText(this.root, "#highest-progress", `${snapshot.highestSuccesses} / ${snapshot.requiredPerEndpoint}`);
    setText(this.root, "#retry-count", String(snapshot.retryCount));

    const sessionActive = ["requesting-permission", "calibrating", "ready", "attempting"].includes(snapshot.phase);
    this.startSessionButton.disabled = !["setup", "stopped", "error"].includes(snapshot.phase);
    this.startAttemptButton.disabled = snapshot.phase !== "ready";
    this.stopButton.disabled = !sessionActive;
    this.downloadButton.disabled = !["ready", "attempting", "summary", "stopped"].includes(snapshot.phase);
    this.copyButton.disabled = this.downloadButton.disabled;
    this.testerId.disabled = sessionActive || snapshot.phase === "summary";
    this.tagInputs.forEach((input) => { input.disabled = snapshot.phase !== "ready"; });
    this.startAttemptButton.textContent = snapshot.phase === "ready"
      ? `Start ${capitalize(snapshot.endpoint)} attempt`
      : "Start 3-second attempt";
  }

  renderObservation(observation: ABObservation): void {
    const snapshot = buildDebugSnapshot(observation);
    for (const [key, value] of Object.entries(snapshot) as [keyof DebugSnapshot, string][]) {
      this.debugElements.get(key)!.textContent = value;
    }
  }

  renderAttempt(attempt: AttemptResult): void {
    this.root.querySelector("#no-attempts")?.remove();
    const row = document.createElement("tr");
    const pitchy = detectorAttemptText(attempt.pitchy);
    const yin = detectorAttemptText(attempt.yin);
    for (const value of [
      `${capitalize(attempt.endpoint)} #${attempt.endpointAttemptNumber}${attempt.completed ? "" : " (cancelled)"}`,
      attempt.tags.length > 0 ? attempt.tags.join(", ") : "unmarked",
      pitchy,
      yin,
      `RMS ${attempt.signal.rmsMedian.toFixed(5)}; SNR ${formatNullable(attempt.signal.snrMedianDb, 1)} dB; ` +
        `clipping ${attempt.signal.clipping ? "YES" : "no"}`,
    ]) {
      const cell = document.createElement("td");
      cell.textContent = value;
      row.append(cell);
    }
    requiredElement(this.root, "#attempts").append(row);
  }

  renderSummary(summary: ValidationSessionSummary): void {
    setText(this.root, '[data-summary="pitchy-success"]', detectorSuccessText(summary.pitchy, summary.attemptCount));
    setText(this.root, '[data-summary="yin-success"]', detectorSuccessText(summary.yin, summary.attemptCount));
    setText(this.root, '[data-summary="no-detection"]',
      `Pitchy ${percent(summary.pitchy.noDetectionRate)} (${summary.pitchy.noDetectionCount}); ` +
      `YIN ${percent(summary.yin.noDetectionRate)} (${summary.yin.noDetectionCount})`);
    setText(this.root, '[data-summary="octave"]',
      `Pitchy ambiguity ${summary.pitchy.octaveAmbiguityCount}; YIN ambiguity ${summary.yin.octaveAmbiguityCount}; ` +
      `paired disagreement ${summary.octaveDisagreementCount}; frame disagreement ` +
      `${summary.frameOctaveDisagreementCount}/${summary.frameComparisonCount} ` +
      `(${percent(summary.frameOctaveDisagreementRate)})`);
    setText(this.root, '[data-summary="summary-retries"]', String(summary.retryCount));
    setText(this.root, '[data-summary="lowest-summary"]', endpointSummaryText(summary.endpoints.lowest));
    setText(this.root, '[data-summary="highest-summary"]', endpointSummaryText(summary.endpoints.highest));
    setText(this.root, '[data-summary="performance"]',
      `Pitchy ${summary.pitchy.processingTimeP50Ms.toFixed(3)}/${summary.pitchy.processingTimeP95Ms.toFixed(3)} ms; ` +
      `YIN ${summary.yin.processingTimeP50Ms.toFixed(3)}/${summary.yin.processingTimeP95Ms.toFixed(3)} ms`);
  }

  renderEnvironment(environment: DeviceEnvironment, info: MicrophoneFrameInfo): void {
    setText(this.root, "#environment", `${environment.os} / ${environment.browser} / ${environment.device}`);
    setText(this.root, "#audio-environment", `${info.sampleRate} Hz; ${info.frameSize} samples; ` +
      `track ${JSON.stringify(info.trackSettings ?? {})}`);
  }

  setStatus(message: string): void {
    setText(this.root, "#status", message);
  }

  private selectedTags(): PhonationTag[] {
    return [...this.tagInputs]
      .filter((input) => input.checked)
      .map((input) => input.value as PhonationTag);
  }
}

function detectorAttemptText(result: AttemptResult["pitchy"]): string {
  if (!result.success) return `failed; ${result.rejectReason ?? "no stable capture"}`;
  return `${result.frequencyHz?.toFixed(2)} Hz / ${result.note} / ${result.confidence?.toFixed(3)}; ` +
    `latency ${result.stableLatencyMs?.toFixed(0)} ms; p50/p95 ` +
    `${result.processingTimeP50Ms.toFixed(3)}/${result.processingTimeP95Ms.toFixed(3)} ms`;
}

function detectorSuccessText(
  result: ValidationSessionSummary["pitchy"],
  total: number,
): string {
  return `${result.successCount}/${total} (${percent(result.successRate)})`;
}

function endpointSummaryText(endpoint: ValidationSessionSummary["endpoints"]["lowest"]): string {
  const repeatability = endpoint.repeatableWithinOneSemitone === null
    ? "INCOMPLETE"
    : endpoint.repeatableWithinOneSemitone ? "PASS" : "FAIL";
  return `${endpoint.notes.length > 0 ? endpoint.notes.join(", ") : "none"}; ${repeatability}; ` +
    `max ${endpoint.maximumSemitoneDifference ?? "n/a"} semitones`;
}

function debugRow(label: string, field: keyof DebugSnapshot): string {
  return `<tr><th scope="row">${label}</th><td data-field="${field}">—</td></tr>`;
}

function summaryRow(label: string, field: string): string {
  return `<tr><th scope="row">${label}</th><td data-summary="${field}">—</td></tr>`;
}

function requiredElement<T extends Element = HTMLElement>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`Missing validation view element: ${selector}`);
  return element;
}

function setText(root: ParentNode, selector: string, value: string): void {
  requiredElement(root, selector).textContent = value;
}

function percent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function capitalize(value: string): string {
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}

function formatNullable(value: number | null, digits: number): string {
  return value === null ? "n/a" : value.toFixed(digits);
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
