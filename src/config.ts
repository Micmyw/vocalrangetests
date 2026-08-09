export interface SpikeConfiguration {
  id: "4096-20hz" | "8192-15hz";
  frameSize: 4096 | 8192;
  cadenceHz: 15 | 20;
  intervalMs: number;
}

const CONFIGURATIONS: Record<SpikeConfiguration["id"], SpikeConfiguration> = {
  "4096-20hz": {
    id: "4096-20hz",
    frameSize: 4096,
    cadenceHz: 20,
    intervalMs: 50,
  },
  "8192-15hz": {
    id: "8192-15hz",
    frameSize: 8192,
    cadenceHz: 15,
    intervalMs: 1000 / 15,
  },
};

export function getSpikeConfiguration(id: string): SpikeConfiguration {
  if (!(id in CONFIGURATIONS)) throw new Error(`Unknown spike configuration: ${id}`);
  return CONFIGURATIONS[id as SpikeConfiguration["id"]];
}
