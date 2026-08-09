import "@fontsource-variable/inter/wght.css";
import "@phosphor-icons/web/regular";
import "./style.css";
import { MicrophoneController } from "./audio/MicrophoneController";
import { PitchyMpmAdapter } from "./dsp/PitchyMpmAdapter";
import { EndpointCaptureController } from "./product/EndpointCaptureController";
import { PitchFrameProcessor } from "./product/PitchFrameProcessor";
import { PRODUCT_AUDIO_CONFIG } from "./product/ProductConfig";
import { VocalRangeTestController } from "./product/VocalRangeTestController";
import { VocalRangeTestView } from "./product/VocalRangeTestView";
import { initializeProductAnalytics } from "./product/analytics";

const root = document.querySelector<HTMLElement>("#vocal-range-tool");
if (!root) throw new Error("Missing #vocal-range-tool mount");

const processor = new PitchFrameProcessor({
  pitchy: new PitchyMpmAdapter(PRODUCT_AUDIO_CONFIG.frameSize),
});
const analytics = initializeProductAnalytics();

let controller: VocalRangeTestController;
const view = new VocalRangeTestView(root, {
  onStartTest: () => controller.startTest(),
  onStartCapture: () => controller.startCapture(),
  onRetryCapture: () => controller.retryCapture(),
  onReopenMicrophone: () => controller.reopenMicrophone(),
  onContinueSuccess: () => controller.continueAfterSuccess(),
  onRetestEndpoint: (endpoint) => controller.retestEndpoint(endpoint),
  onTestAgain: () => controller.testAgain(),
});

controller = new VocalRangeTestController({
  processor,
  view,
  analytics,
  createCapture: (options) => new EndpointCaptureController(options),
  createMicrophone: (onFrame) => new MicrophoneController({
    frameSize: PRODUCT_AUDIO_CONFIG.frameSize,
    intervalMs: PRODUCT_AUDIO_CONFIG.intervalMs,
    onFrame,
    visibilitySource: null,
  }),
});

document.addEventListener("visibilitychange", () => {
  if (document.hidden) void controller.handleHidden();
});

