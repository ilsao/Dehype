import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";

const outputRoot = resolve("dist");
const extensionRoot = resolve("extension");
const manifestPath = resolve(outputRoot, "manifest.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const sourceManifest = JSON.parse(
  await readFile(resolve(extensionRoot, "manifest.json"), "utf8"),
);

const requiredPermissions = ["activeTab", "scripting", "storage"];
const requiredHosts = [
  "https://api.openai.com/*",
  "https://generativelanguage.googleapis.com/*",
  "https://api.anthropic.com/*",
  "https://www.temu.com/*",
];

for (const candidateManifest of [sourceManifest, manifest]) {
  for (const permission of requiredPermissions) {
    if (!candidateManifest.permissions?.includes(permission)) {
      throw new Error(`Manifest is missing the ${permission} permission.`);
    }
  }

  for (const host of requiredHosts) {
    if (!candidateManifest.host_permissions?.includes(host)) {
      throw new Error(`Manifest is missing host permission ${host}.`);
    }
  }
}

const manifestFiles = [
  manifest.action?.default_popup,
  manifest.action?.default_icon,
  manifest.background?.service_worker,
  manifest.icons?.["32"],
  ...(manifest.content_scripts ?? []).flatMap(
    (contentScript) => contentScript.js ?? [],
  ),
].filter((value) => typeof value === "string");

const expectedFiles = [
  ...manifestFiles,
  "src/popup/popup.html",
  "src/sidepanel/index.html",
];

await Promise.all(
  expectedFiles.map((file) => access(resolve(outputRoot, file.replace(/^\.\//, "")))),
);

const sourceFiles = [
  sourceManifest.action?.default_popup,
  sourceManifest.background?.service_worker,
  sourceManifest.icons?.["32"],
  ...(sourceManifest.content_scripts ?? []).flatMap(
    (contentScript) => contentScript.js ?? [],
  ),
].filter((value) => typeof value === "string");

await Promise.all(
  sourceFiles.map((file) => access(resolve(extensionRoot, file))),
);
