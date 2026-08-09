import { describe, expect, it } from "vitest";
import { getSpikeConfiguration } from "./config";

describe("getSpikeConfiguration", () => {
  it("keeps the two approved configurations exact", () => {
    expect(getSpikeConfiguration("4096-20hz")).toEqual({
      id: "4096-20hz",
      frameSize: 4096,
      cadenceHz: 20,
      intervalMs: 50,
    });
    expect(getSpikeConfiguration("8192-15hz")).toEqual({
      id: "8192-15hz",
      frameSize: 8192,
      cadenceHz: 15,
      intervalMs: 1000 / 15,
    });
  });

  it("rejects unknown configurations", () => {
    expect(() => getSpikeConfiguration("2048-60hz")).toThrow(/Unknown/);
  });
});
