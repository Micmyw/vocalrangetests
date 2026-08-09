import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const homepage = readFileSync(new URL("../../index.html", import.meta.url), "utf8");

describe("static SEO documents", () => {
  it("keeps the homepage focused on one canonical Vocal Range Test intent", () => {
    expect(homepage).toContain("Vocal Range Test – Find Your Lowest &amp; Highest Notes");
    expect(homepage).toContain('name="description"');
    expect(homepage).toContain('href="https://vocalrangetests.com/"');
    expect(homepage.match(/<h1\b/g)).toHaveLength(1);
    expect(homepage).toContain("Sing your lowest and highest comfortable notes");
    expect(homepage).toContain('id="vocal-range-tool"');
    expect(homepage).not.toMatch(/guitar tuner|ear training|AI-powered/i);
  });

  it("ships all approved support sections in the initial HTML", () => {
    for (const heading of [
      "How this vocal range test works",
      "How to get a more accurate result",
      "Understanding your vocal range result",
      "What this test can—and can’t—tell you",
      "Microphone privacy",
      "Common questions",
    ]) expect(homepage).toContain(heading);
    expect(homepage).toContain('href="/privacy"');
  });

  it("keeps Privacy non-indexable and discloses the actual processing boundary", () => {
    const privacy = readFileSync(new URL("../../privacy/index.html", import.meta.url), "utf8");

    expect(privacy).toContain("Privacy Policy");
    expect(privacy).toContain("__PRIVACY_ROBOTS__");
    expect(privacy).toContain('href="https://vocalrangetests.com/privacy"');
    expect(privacy).toContain("processed locally in your browser");
    expect(privacy).toContain("not recorded, saved, or uploaded");
    expect(privacy).toContain("Vercel Web Analytics");
    expect(privacy).toContain("privacy@vocalrangetests.com");
  });

  it("lists only the canonical homepage in the sitemap", () => {
    const sitemap = readFileSync(new URL("../../public/sitemap.xml", import.meta.url), "utf8");

    expect(sitemap).toContain("https://vocalrangetests.com/");
    expect(sitemap).not.toContain("/privacy");
    expect(sitemap.match(/<url>/g)).toHaveLength(1);
  });
});
