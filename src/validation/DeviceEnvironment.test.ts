import { describe, expect, it } from "vitest";
import { detectDeviceEnvironment } from "./DeviceEnvironment";

const IPHONE_SAFARI = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) " +
  "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1";
const ANDROID_CHROME = "Mozilla/5.0 (Linux; Android 15; Pixel 9 Build/AP3A) " +
  "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Mobile Safari/537.36";
const WINDOWS_EDGE = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
  "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36 Edg/138.0.0.0";
const MAC_SAFARI = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) " +
  "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15";

describe("detectDeviceEnvironment", () => {
  it("recognizes iPhone Safari", () => {
    expect(detectDeviceEnvironment(IPHONE_SAFARI)).toMatchObject({
      os: "iOS 18.5",
      browser: "Safari 18.5",
      device: "iPhone",
    });
  });

  it("recognizes Android Chrome", () => {
    expect(detectDeviceEnvironment(ANDROID_CHROME)).toMatchObject({
      os: "Android 15",
      browser: "Chrome 138.0.0.0",
      device: "Pixel 9",
    });
  });

  it("distinguishes Windows Edge from Chrome", () => {
    expect(detectDeviceEnvironment(WINDOWS_EDGE)).toMatchObject({
      os: "Windows",
      browser: "Edge 138.0.0.0",
      device: "Desktop",
    });
  });

  it("recognizes macOS Safari and preserves the raw user agent", () => {
    expect(detectDeviceEnvironment(MAC_SAFARI)).toEqual({
      os: "macOS 10.15.7",
      browser: "Safari 18.5",
      device: "Mac",
      userAgent: MAC_SAFARI,
    });
  });

  it("falls back to supplied platform without inventing a device", () => {
    expect(detectDeviceEnvironment("CustomBrowser/1.0", "Test Platform")).toEqual({
      os: "Test Platform",
      browser: "Unknown browser",
      device: "Unknown device",
      userAgent: "CustomBrowser/1.0",
    });
  });
});
