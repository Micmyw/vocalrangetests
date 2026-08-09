import type { ABObservation, DetectorObservation } from "../dsp/ABRunner";

export interface DebugSnapshot {
  rms: string;
  noise: string;
  clipping: string;
  pitchy: string;
  yin: string;
  signalState: string;
  stableState: string;
  stableDuration: string;
  rejectReason: string;
  processingTime: string;
}

export interface DebugViewHandlers {
  onStart: () => void | Promise<void>;
  onStop: () => void | Promise<void>;
  onCalibrate: () => void;
  onReset: () => void;
  onDownload: () => void;
  onCopy: () => void | Promise<void>;
  onConfigurationChange: (configurationId: string) => void;
}

const EMPTY_SNAPSHOT: DebugSnapshot = {
  rms: "—",
  noise: "—",
  clipping: "—",
  pitchy: "—",
  yin: "—",
  signalState: "idle",
  stableState: "Pitchy idle | YIN idle",
  stableDuration: "Pitchy 0 ms | YIN 0 ms",
  rejectReason: "Pitchy none | YIN none",
  processingTime: "Pitchy — | YIN —",
};

export function buildDebugSnapshot(observation: ABObservation): DebugSnapshot {
  return {
    rms: `${observation.signal.rms.toFixed(5)} (${dbfs(observation.signal.rms)})`,
    noise: `${observation.signal.noiseFloorRms.toFixed(5)} / ` +
      `${observation.signal.noiseFloorDb.toFixed(1)} dBFS; SNR ${formatDb(observation.signal.snrDb)}`,
    clipping: observation.signal.clipping
      ? `YES (${(observation.signal.clippedSampleRatio * 100).toFixed(2)}%)`
      : `no (${(observation.signal.clippedSampleRatio * 100).toFixed(2)}%)`,
    pitchy: detectorReading(observation.pitchy, "clarity"),
    yin: detectorReading(observation.yin, "confidence"),
    signalState: observation.signal.state,
    stableState: `Pitchy ${observation.pitchy.stable.state} | YIN ${observation.yin.stable.state}`,
    stableDuration: `Pitchy ${observation.pitchy.stable.stableDurationMs.toFixed(0)} ms | ` +
      `YIN ${observation.yin.stable.stableDurationMs.toFixed(0)} ms`,
    rejectReason: `Pitchy ${observation.pitchy.stable.rejectReason ?? "none"} | ` +
      `YIN ${observation.yin.stable.rejectReason ?? "none"}`,
    processingTime: `Pitchy ${observation.pitchy.processingTimeMs.toFixed(3)} ms | ` +
      `YIN ${observation.yin.processingTimeMs.toFixed(3)} ms`,
  };
}

export class DebugView {
  private readonly elements = new Map<keyof DebugSnapshot, HTMLElement>();
  private readonly startButton: HTMLButtonElement;
  private readonly stopButton: HTMLButtonElement;
  private readonly calibrateButton: HTMLButtonElement;
  private readonly configurationSelect: HTMLSelectElement;
  private readonly status: HTMLElement;

  constructor(root: HTMLElement, handlers: DebugViewHandlers) {
    root.innerHTML = `
      <section class="spike-shell">
        <h1>Vocal Range Pitch Technical Spike</h1>
        <p class="warning">Synthetic tests are not production approval. Real voice + real device testing is required.</p>
        <div class="controls">
          <label>Configuration
            <select id="configuration">
              <option value="4096-20hz">4096 samples / 20 Hz</option>
              <option value="8192-15hz">8192 samples / 15 Hz</option>
            </select>
          </label>
          <button id="start" type="button">Start microphone</button>
          <button id="stop" type="button" disabled>Stop</button>
          <button id="calibrate" type="button" disabled>Calibrate noise (0.6s)</button>
          <button id="reset" type="button">Reset capture</button>
          <button id="download" type="button">Download JSON</button>
          <button id="copy" type="button">Copy text</button>
        </div>
        <p id="status" role="status">Idle</p>
        <table>
          <tbody>
            ${row("RMS", "rms")}
            ${row("Noise floor / SNR", "noise")}
            ${row("Clipping", "clipping")}
            ${row("Pitchy Hz / note / clarity", "pitchy")}
            ${row("YIN Hz / note / confidence", "yin")}
            ${row("Signal state", "signalState")}
            ${row("Stable state", "stableState")}
            ${row("Stable duration", "stableDuration")}
            ${row("Reject reason", "rejectReason")}
            ${row("Detector processing time", "processingTime")}
          </tbody>
        </table>
      </section>`;

    for (const key of Object.keys(EMPTY_SNAPSHOT) as (keyof DebugSnapshot)[]) {
      this.elements.set(key, requiredElement(root, `[data-field="${key}"]`));
    }
    this.startButton = requiredElement(root, "#start");
    this.stopButton = requiredElement(root, "#stop");
    this.calibrateButton = requiredElement(root, "#calibrate");
    this.configurationSelect = requiredElement(root, "#configuration");
    this.status = requiredElement(root, "#status");

    this.startButton.addEventListener("click", () => void handlers.onStart());
    this.stopButton.addEventListener("click", () => void handlers.onStop());
    this.calibrateButton.addEventListener("click", handlers.onCalibrate);
    requiredElement<HTMLButtonElement>(root, "#reset").addEventListener("click", handlers.onReset);
    requiredElement<HTMLButtonElement>(root, "#download").addEventListener("click", handlers.onDownload);
    requiredElement<HTMLButtonElement>(root, "#copy").addEventListener("click", () => void handlers.onCopy());
    this.configurationSelect.addEventListener("change", () =>
      handlers.onConfigurationChange(this.configurationSelect.value),
    );
    this.renderSnapshot(EMPTY_SNAPSHOT);
  }

  renderObservation(observation: ABObservation): void {
    this.renderSnapshot(buildDebugSnapshot(observation));
  }

  clear(): void {
    this.renderSnapshot(EMPTY_SNAPSHOT);
    this.setStatus("Idle");
  }

  setRunning(running: boolean): void {
    this.startButton.disabled = running;
    this.stopButton.disabled = !running;
    this.calibrateButton.disabled = !running;
    this.configurationSelect.disabled = running;
  }

  setStatus(message: string): void {
    this.status.textContent = message;
  }

  private renderSnapshot(snapshot: DebugSnapshot): void {
    for (const [key, value] of Object.entries(snapshot) as [keyof DebugSnapshot, string][]) {
      this.elements.get(key)!.textContent = value;
    }
  }
}

function detectorReading(observation: DetectorObservation, confidenceLabel: string): string {
  if (!observation.estimate || !observation.note) return "no detection";
  return `${observation.estimate.frequencyHz.toFixed(2)} Hz / ${observation.note.note} ` +
    `(${signed(observation.note.cents)} cents) / ${confidenceLabel} ${observation.estimate.confidence.toFixed(3)}`;
}

function dbfs(value: number): string {
  return value > 0 ? `${(20 * Math.log10(value)).toFixed(1)} dBFS` : "-∞ dBFS";
}

function formatDb(value: number): string {
  return Number.isFinite(value) ? `${value.toFixed(1)} dB` : "-∞ dB";
}

function signed(value: number): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}`;
}

function row(label: string, field: keyof DebugSnapshot): string {
  return `<tr><th scope="row">${label}</th><td data-field="${field}">—</td></tr>`;
}

function requiredElement<T extends Element = HTMLElement>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`Missing debug view element: ${selector}`);
  return element;
}
