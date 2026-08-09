import { describe, expect, it } from "vitest";
import { serializeSessionExport } from "../export/SessionExporter";
import { runValidationSimulation } from "./runValidationSimulation";

describe("runValidationSimulation", () => {
  it("produces a clearly marked complete session with one retained retry", () => {
    const report = runValidationSimulation();

    expect(report.schemaVersion).toBe(2);
    expect(report.simulated).toBe(true);
    expect(report.session.context.testerId).toBe("SIM-001");
    expect(report.session.calibration.durationMs).toBe(3000);
    expect(report.session.summary).toMatchObject({
      attemptCount: 7,
      retryCount: 1,
    });
    expect(report.session.summary.endpoints.lowest).toMatchObject({
      completed: true,
      notes: ["A2", "A2", "A2"],
      repeatableWithinOneSemitone: true,
    });
    expect(report.session.summary.endpoints.highest).toMatchObject({
      completed: true,
      notes: ["A4", "A4", "A4"],
      repeatableWithinOneSemitone: true,
    });
    expect(serializeSessionExport(report)).not.toMatch(/"(?:pcm|email|name|rawAudio)"/i);
  });
});
