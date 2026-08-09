import { describe, expect, it, vi } from "vitest";
import { ProductAnalytics } from "./analytics";

describe("ProductAnalytics", () => {
  it("sends allowlisted lifecycle events without measurement properties", () => {
    const send = vi.fn();
    const analytics = new ProductAnalytics({ enabled: true, send });

    expect(analytics.track("result_viewed")).toBe(true);
    expect(send).toHaveBeenCalledWith("result_viewed");
  });

  it("rejects unknown events and any custom property payload", () => {
    const analytics = new ProductAnalytics({ enabled: true, send: vi.fn() });

    expect(() => analytics.track("note_detected")).toThrow(/not allowlisted/);
    expect(() => analytics.track("result_viewed", { note: "A4" })).toThrow(/properties/);
  });

  it("does nothing outside the production consumer domain", () => {
    const send = vi.fn();
    const analytics = new ProductAnalytics({ enabled: false, send });

    expect(analytics.track("test_started")).toBe(false);
    expect(send).not.toHaveBeenCalled();
  });
});
