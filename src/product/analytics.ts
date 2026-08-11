export const ANALYTICS_EVENTS = [
  "test_started",
  "microphone_ready",
  "calibration_completed",
  "capture_succeeded",
  "capture_rejected",
  "result_viewed",
  "retest_started",
  "test_restarted",
] as const;

export type AnalyticsEvent = typeof ANALYTICS_EVENTS[number];

interface ProductAnalyticsOptions {
  enabled: boolean;
  send: (event: AnalyticsEvent) => void;
}

export class ProductAnalytics {
  private readonly enabled: boolean;
  private readonly send: ProductAnalyticsOptions["send"];

  constructor(options: ProductAnalyticsOptions) {
    this.enabled = options.enabled;
    this.send = options.send;
  }

  track(event: string, ...unexpectedProperties: unknown[]): boolean {
    if (!ANALYTICS_EVENTS.includes(event as AnalyticsEvent)) {
      throw new Error(`Analytics event is not allowlisted: ${event}`);
    }
    if (unexpectedProperties.length > 0) {
      throw new Error("Analytics properties are prohibited for Vocal Range Test events");
    }
    if (!this.enabled) return false;
    this.send(event as AnalyticsEvent);
    return true;
  }
}

export function initializeProductAnalytics(): ProductAnalytics {
  const enabled = import.meta.env.PROD &&
    typeof location !== "undefined" &&
    location.hostname === "vocalrangetests.com";
  return new ProductAnalytics({
    enabled,
    send: (event) => {
      const analyticsWindow = window as typeof window & {
        gtag?: (...arguments_: unknown[]) => void;
      };
      analyticsWindow.gtag?.("event", event);
    },
  });
}
