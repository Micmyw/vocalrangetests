import { describe, expect, it, vi } from "vitest";
import { MicrophoneController } from "./MicrophoneController";

describe("MicrophoneController", () => {
  it("captures one reusable frame at the actual AudioContext sample rate and cleans up", async () => {
    const stopTrack = vi.fn();
    const track = {
      stop: stopTrack,
      getSettings: () => ({ sampleRate: 48_000, channelCount: 1 }),
    };
    const stream = { getTracks: () => [track], getAudioTracks: () => [track] };
    const getUserMedia = vi.fn(async () => stream as unknown as MediaStream);
    const disconnectSource = vi.fn();
    const source = { connect: vi.fn(), disconnect: disconnectSource };
    const disconnectAnalyser = vi.fn();
    const analyser = {
      fftSize: 2048,
      smoothingTimeConstant: 1,
      getFloatTimeDomainData: (frame: Float32Array) => frame.fill(0.25),
      disconnect: disconnectAnalyser,
    };
    source.connect.mockReturnValue(analyser);
    const resume = vi.fn(async () => undefined);
    const close = vi.fn(async () => undefined);
    const context = {
      state: "suspended",
      sampleRate: 48_000,
      resume,
      close,
      createMediaStreamSource: () => source,
      createAnalyser: () => analyser,
    };
    let scheduled: (() => void) | null = null;
    const cancel = vi.fn();
    const frames: Float32Array[] = [];
    const controller = new MicrophoneController({
      frameSize: 4096,
      intervalMs: 50,
      onFrame: (frame) => frames.push(frame),
      getUserMedia,
      createAudioContext: () => context as unknown as AudioContext,
      schedule: (callback) => {
        scheduled = callback;
        return 17;
      },
      cancel,
      now: () => 1234,
    });

    const info = await controller.start();
    expect(getUserMedia).toHaveBeenCalledWith({
      audio: {
        autoGainControl: false,
        channelCount: 1,
        echoCancellation: false,
        noiseSuppression: false,
      },
    });
    expect(resume).toHaveBeenCalledOnce();
    expect(analyser.fftSize).toBe(4096);
    expect(analyser.smoothingTimeConstant).toBe(0);
    expect(info.sampleRate).toBe(48_000);

    expect(scheduled).not.toBeNull();
    (scheduled as unknown as () => void)();
    expect(frames).toHaveLength(1);
    expect(frames[0]).toHaveLength(4096);
    expect(frames[0][0]).toBe(0.25);

    await controller.stop();
    expect(cancel).toHaveBeenCalledWith(17);
    expect(stopTrack).toHaveBeenCalledOnce();
    expect(disconnectSource).toHaveBeenCalledOnce();
    expect(disconnectAnalyser).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();
    expect(controller.state).toBe("idle");
  });

  it("lets a consumer controller own visibility when null is passed explicitly", async () => {
    const addEventListener = vi.fn();
    const removeEventListener = vi.fn();
    vi.stubGlobal("document", {
      hidden: false,
      addEventListener,
      removeEventListener,
    });
    const track = { stop: vi.fn(), getSettings: () => ({}) };
    const analyser = {
      fftSize: 2048,
      smoothingTimeConstant: 1,
      getFloatTimeDomainData: vi.fn(),
      disconnect: vi.fn(),
    };
    const source = { connect: vi.fn(), disconnect: vi.fn() };
    const context = {
      state: "running",
      sampleRate: 48_000,
      close: vi.fn(async () => undefined),
      createMediaStreamSource: () => source,
      createAnalyser: () => analyser,
    };
    const controller = new MicrophoneController({
      frameSize: 4096,
      intervalMs: 50,
      onFrame: () => undefined,
      getUserMedia: async () => ({
        getTracks: () => [track],
        getAudioTracks: () => [track],
      } as unknown as MediaStream),
      createAudioContext: () => context as unknown as AudioContext,
      schedule: () => 1,
      cancel: () => undefined,
      visibilitySource: null,
    });

    await controller.start();
    expect(addEventListener).not.toHaveBeenCalled();
    await controller.stop();
    expect(removeEventListener).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
