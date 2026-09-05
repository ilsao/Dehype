import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cwd } from "node:process";

import { describe, expect, it } from "vitest";

const popupHtml = readFileSync(
  resolve(cwd(), "extension/src/popup/popup.html"),
  "utf8",
);

describe("popup analysis settings", () => {
  it("offers cloud providers without an on-device analysis mode", () => {
    expect(popupHtml).not.toContain('id="analysis-mode"');
    expect(popupHtml).not.toContain("On-device rules");
    expect(popupHtml).toContain('<option value="openai">');
    expect(popupHtml).toContain('<option value="gemini">');
    expect(popupHtml).toContain('<option value="claude">');
  });
});
