import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";

const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));
const viteExecutable = fileURLToPath(new URL("../../node_modules/vite/bin/vite.js", import.meta.url));
const temporaryBuilds: string[] = [];

function buildPages(production: boolean): string[] {
  const outputDirectory = mkdtempSync(join(tmpdir(), "vocal-range-analytics-"));
  temporaryBuilds.push(outputDirectory);
  const environment = { ...process.env };
  if (production) environment.VERCEL_ENV = "production";
  else delete environment.VERCEL_ENV;

  const result = spawnSync(
    process.execPath,
    [viteExecutable, "build", "--outDir", outputDirectory],
    { cwd: repositoryRoot, env: environment, encoding: "utf8" },
  );
  if (result.status !== 0) {
    throw new Error(`Vite build failed:\n${result.stdout}\n${result.stderr}`);
  }

  return [
    readFileSync(join(outputDirectory, "index.html"), "utf8"),
    readFileSync(join(outputDirectory, "privacy", "index.html"), "utf8"),
  ];
}

afterEach(() => {
  for (const directory of temporaryBuilds.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("production analytics tags", () => {
  it("emits exactly one GA4 and Clarity integration on every public page", () => {
    for (const page of buildPages(true)) {
      expect(page.match(/googletagmanager\.com\/gtag\/js\?id=G-0W5T7N4B2Y/g)).toHaveLength(1);
      expect(page.match(/gtag\('config', 'G-0W5T7N4B2Y'\)/g)).toHaveLength(1);
      expect(page.match(/clarity\.ms\/tag\//g)).toHaveLength(1);
      expect(page.match(/"y0jxe2o34f"/g)).toHaveLength(1);
    }
  });

  it("does not load GA4 or Clarity outside production builds", () => {
    for (const page of buildPages(false)) {
      expect(page).not.toContain("G-0W5T7N4B2Y");
      expect(page).not.toContain("clarity.ms/tag");
      expect(page).not.toContain("y0jxe2o34f");
    }
  });
});
