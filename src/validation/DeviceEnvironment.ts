import type { DeviceEnvironment } from "./types";

export function detectDeviceEnvironment(
  userAgent: string,
  platform = "",
): DeviceEnvironment {
  return {
    os: detectOs(userAgent, platform),
    browser: detectBrowser(userAgent),
    device: detectDevice(userAgent),
    userAgent,
  };
}

function detectOs(userAgent: string, platform: string): string {
  const ios = userAgent.match(/(?:CPU iPhone OS|CPU OS) ([\d_]+)/);
  if (ios) return `iOS ${ios[1].replaceAll("_", ".")}`;

  const android = userAgent.match(/Android ([\d.]+)/);
  if (android) return `Android ${android[1]}`;

  if (/Windows NT/i.test(userAgent)) return "Windows";

  const mac = userAgent.match(/Mac OS X ([\d_]+)/);
  if (mac) return `macOS ${mac[1].replaceAll("_", ".")}`;

  return platform.trim() || "Unknown OS";
}

function detectBrowser(userAgent: string): string {
  const edge = userAgent.match(/Edg\/([\d.]+)/);
  if (edge) return `Edge ${edge[1]}`;

  const chrome = userAgent.match(/(?:Chrome|CriOS)\/([\d.]+)/);
  if (chrome) return `Chrome ${chrome[1]}`;

  const firefox = userAgent.match(/(?:Firefox|FxiOS)\/([\d.]+)/);
  if (firefox) return `Firefox ${firefox[1]}`;

  const safari = userAgent.match(/Version\/([\d.]+).*Safari\//);
  if (safari) return `Safari ${safari[1]}`;

  return "Unknown browser";
}

function detectDevice(userAgent: string): string {
  if (/iPhone/i.test(userAgent)) return "iPhone";
  if (/iPad/i.test(userAgent)) return "iPad";

  const androidDevice = userAgent.match(/Android [^;\)]+;\s*([^;\)]+?)(?:\s+Build\/|;|\))/);
  if (androidDevice) return androidDevice[1].trim();
  if (/Android/i.test(userAgent)) return /Mobile/i.test(userAgent)
    ? "Android mobile"
    : "Android tablet";

  if (/Macintosh/i.test(userAgent)) return "Mac";
  if (/Windows/i.test(userAgent)) return "Desktop";
  return "Unknown device";
}
