import "./validation-style.css";
import { MicrophoneController } from "./audio/MicrophoneController";
import { ABRunner } from "./dsp/ABRunner";
import { PitchyMpmAdapter } from "./dsp/PitchyMpmAdapter";
import { YinBackupAdapter } from "./dsp/YinBackupAdapter";
import { formatSessionAsText, serializeSessionExport } from "./export/SessionExporter";
import { ValidationHarnessView } from "./ui/ValidationHarnessView";
import { detectDeviceEnvironment } from "./validation/DeviceEnvironment";
import { ValidationHarnessController } from "./validation/ValidationHarnessController";

const FRAME_SIZE = 4096;
const INTERVAL_MS = 50;

const root = document.querySelector<HTMLElement>("#app");
if (!root) throw new Error("Missing #app root");

let controller: ValidationHarnessController;
const view = new ValidationHarnessView(root, {
  onStartSession: (testerId) => controller.startSession(testerId),
  onStartAttempt: (tags) => controller.startAttempt(tags),
  onStop: () => controller.stopSession(),
  onDownload: downloadReport,
  onCopy: copyReport,
}, createAnonymousTesterId());

controller = new ValidationHarnessController({
  runner: new ABRunner({
    pitchy: new PitchyMpmAdapter(FRAME_SIZE),
    yin: new YinBackupAdapter(FRAME_SIZE),
  }),
  environment: detectDeviceEnvironment(navigator.userAgent, navigator.platform),
  view,
  createMicrophone: (onFrame) => new MicrophoneController({
    frameSize: FRAME_SIZE,
    intervalMs: INTERVAL_MS,
    onFrame,
  }),
});

function downloadReport(): void {
  const report = controller.buildReport();
  if (!report) {
    view.setStatus("Complete noise calibration before exporting a report.");
    return;
  }
  const blob = new Blob([serializeSessionExport(report)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `vocal-range-validation-${report.session.context.sessionId}-${fileTimestamp()}.json`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  view.setStatus(`Downloaded ${report.session.summary.attemptCount} attempts as schema-v2 JSON.`);
}

async function copyReport(): Promise<void> {
  const report = controller.buildReport();
  if (!report) {
    view.setStatus("Complete noise calibration before copying a report.");
    return;
  }
  const text = formatSessionAsText(report);
  try {
    if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(text);
    else fallbackCopy(text);
    view.setStatus(`Copied summary for ${report.session.summary.attemptCount} attempts.`);
  } catch (error) {
    view.setStatus(`Copy failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function fallbackCopy(text: string): void {
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.append(textarea);
  try {
    textarea.select();
    if (!document.execCommand("copy")) throw new Error("Clipboard API unavailable");
  } finally {
    textarea.remove();
  }
}

function createAnonymousTesterId(): string {
  const randomPart = typeof crypto.randomUUID === "function"
    ? crypto.randomUUID().slice(0, 8).toUpperCase()
    : Math.random().toString(36).slice(2, 10).toUpperCase();
  return `T-${randomPart}`;
}

function fileTimestamp(): string {
  return new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
}

document.addEventListener("visibilitychange", () => {
  if (
    document.hidden &&
    ["requesting-permission", "calibrating", "ready", "attempting"].includes(controller.phase)
  ) void controller.handleVisibilityHidden();
});
