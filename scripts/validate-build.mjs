import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";

const outputRoot = resolve("dist");
const manifestPath = resolve(outputRoot, "manifest.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));

const manifestFiles = [
  manifest.action?.default_popup,
  manifest.action?.default_icon,
  manifest.background?.service_worker,
].filter((value) => typeof value === "string");

const expectedFiles = [
  ...manifestFiles,
  "src/popup/popup.html",
  "src/sidepanel/index.html",
  "assets/content.js",
];

await Promise.all(
  expectedFiles.map((file) => access(resolve(outputRoot, file.replace(/^\.\//, "")))),
);
