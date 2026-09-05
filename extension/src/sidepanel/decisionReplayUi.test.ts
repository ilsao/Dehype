import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const replayHtml = readFileSync(
  resolve(process.cwd(), "extension/src/sidepanel/decisionReplay.html"),
  "utf8",
);
const replayCss = readFileSync(
  resolve(process.cwd(), "extension/src/sidepanel/decisionReplay.css"),
  "utf8",
);

describe("Decision Replay side-panel shell", () => {
  it("uses the same branded header and back control as the other views", () => {
    expect(replayHtml).toContain('class="app-header"');
    expect(replayHtml).toContain('class="brand-icon"');
    expect(replayHtml).toContain('class="back-button"');
    expect(replayHtml).toContain('href="./index.html"');
    expect(readFileSync(
      resolve(process.cwd(), "extension/src/sidepanel/sidepanel.css"),
      "utf8",
    )).toMatch(/\.brand-button[^}]*color:inherit/);
  });

  it("reuses User Need instead of rendering a second budget editor", () => {
    expect(replayHtml).toContain('id="intent-summary"');
    expect(replayHtml).toContain('href="./index.html#needs"');
    expect(replayHtml).not.toContain('id="budget"');
    expect(replayHtml).not.toContain('id="save-intent"');
  });

  it("keeps Replay within the shared side-panel width and a single chart column", () => {
    expect(replayCss).not.toContain("700px");
    expect(replayCss).toContain("grid-template-columns: 1fr;");
  });
});
