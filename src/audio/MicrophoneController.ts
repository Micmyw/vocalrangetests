export type MicrophoneState = "idle" | "starting" | "running" | "error";

export interface MicrophoneFrameInfo {
  sampleRate: number;
  frameSize: number;
  intervalMs: number;
  trackSettings: MediaTrackSettings | null;
}

interface VisibilitySource {
  readonly hidden: boolean;
  addEventListener(type: "visibilitychange", listener: () => void): void;
  removeEventListener(type: "visibilitychange", listener: () => void): void;
}

export interface MicrophoneControllerOptions {
  frameSize: 4096 | 8192;
  intervalMs: number;
  onFrame: (frame: Float32Array, sampleRate: number, timestampMs: number) => void;
  getUserMedia?: (constraints: MediaStreamConstraints) => Promise<MediaStream>;
  createAudioContext?: () => AudioContext;
  schedule?: (callback: () => void, intervalMs: number) => number;
  cancel?: (timerId: number) => void;
  now?: () => number;
  visibilitySource?: VisibilitySource | null;
}

export class MicrophoneController {
  readonly frameSize: 4096 | 8192;
  readonly intervalMs: number;
  state: MicrophoneState = "idle";
  lastError: string | null = null;

  private readonly onFrame: MicrophoneControllerOptions["onFrame"];
  private readonly getUserMedia: NonNullable<MicrophoneControllerOptions["getUserMedia"]>;
  private readonly createAudioContext: NonNullable<MicrophoneControllerOptions["createAudioContext"]>;
  private readonly schedule: NonNullable<MicrophoneControllerOptions["schedule"]>;
  private readonly cancel: NonNullable<MicrophoneControllerOptions["cancel"]>;
  private readonly now: NonNullable<MicrophoneControllerOptions["now"]>;
  private readonly visibilitySource: VisibilitySource | null;

  private stream: MediaStream | null = null;
  private context: AudioContext | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private analyser: AnalyserNode | null = null;
  private timerId: number | null = null;
  private frame: Float32Array<ArrayBuffer> | null = null;

  constructor(options: MicrophoneControllerOptions) {
    this.frameSize = options.frameSize;
    this.intervalMs = options.intervalMs;
    this.onFrame = options.onFrame;
    this.getUserMedia = options.getUserMedia ?? ((constraints) => {
      if (!navigator.mediaDevices?.getUserMedia) {
        return Promise.reject(new Error("getUserMedia is unavailable; use HTTPS or localhost"));
      }
      return navigator.mediaDevices.getUserMedia(constraints);
    });
    this.createAudioContext = options.createAudioContext ?? (() => {
      const BrowserAudioContext = window.AudioContext ??
        (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!BrowserAudioContext) throw new Error("Web Audio API is unavailable");
      return new BrowserAudioContext();
    });
    this.schedule = options.schedule ?? ((callback, intervalMs) => window.setInterval(callback, intervalMs));
    this.cancel = options.cancel ?? ((timerId) => window.clearInterval(timerId));
    this.now = options.now ?? (() => performance.now());
    this.visibilitySource = options.visibilitySource === undefined
      ? (typeof document === "undefined" ? null : document)
      : options.visibilitySource;
  }

  async start(): Promise<MicrophoneFrameInfo> {
    if (this.state === "starting" || this.state === "running") {
      throw new Error("Microphone capture is already active");
    }
    this.state = "starting";
    this.lastError = null;

    try {
      this.stream = await this.getUserMedia({
        audio: {
          autoGainControl: false,
          channelCount: 1,
          echoCancellation: false,
          noiseSuppression: false,
        },
      });
      this.context = this.createAudioContext();
      if (this.context.state === "suspended") await this.context.resume();
      this.source = this.context.createMediaStreamSource(this.stream);
      this.analyser = this.context.createAnalyser();
      this.analyser.fftSize = this.frameSize;
      this.analyser.smoothingTimeConstant = 0;
      this.source.connect(this.analyser);
      this.frame = new Float32Array(this.frameSize);
      this.timerId = this.schedule(() => this.captureFrame(), this.intervalMs);
      this.visibilitySource?.addEventListener("visibilitychange", this.handleVisibilityChange);
      this.state = "running";

      return {
        sampleRate: this.context.sampleRate,
        frameSize: this.frameSize,
        intervalMs: this.intervalMs,
        trackSettings: this.stream.getAudioTracks()[0]?.getSettings() ?? null,
      };
    } catch (error) {
      await this.release();
      this.state = "error";
      this.lastError = error instanceof Error ? error.message : String(error);
      throw error;
    }
  }

  async stop(): Promise<void> {
    await this.release();
    this.state = "idle";
  }

  private captureFrame(): void {
    if (this.state !== "running" || !this.analyser || !this.frame || !this.context) return;
    this.analyser.getFloatTimeDomainData(this.frame);
    this.onFrame(this.frame, this.context.sampleRate, this.now());
  }

  private readonly handleVisibilityChange = (): void => {
    if (this.visibilitySource?.hidden && this.state === "running") void this.stop();
  };

  private async release(): Promise<void> {
    this.visibilitySource?.removeEventListener("visibilitychange", this.handleVisibilityChange);
    if (this.timerId !== null) {
      this.cancel(this.timerId);
      this.timerId = null;
    }
    this.source?.disconnect();
    this.analyser?.disconnect();
    this.stream?.getTracks().forEach((track) => track.stop());
    if (this.context && this.context.state !== "closed") await this.context.close();
    this.frame = null;
    this.analyser = null;
    this.source = null;
    this.context = null;
    this.stream = null;
  }
}
