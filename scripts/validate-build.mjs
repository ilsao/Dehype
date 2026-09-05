import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";

const outputRoot = resolve("dist");
const manifestPath = resolve(outputRoot, "manifest.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const developmentManifest = JSON.parse(
  await readFile(resolve("manifest.json"), "utf8"),
);

const requiredPermissions = ["storage"];
const requiredHosts = [
  "https://api.openai.com/*",
  "https://generativelanguage.googleapis.com/*",
  "https://api.anthropic.com/*",
  "https://www.temu.com/*",
];

for (const candidateManifest of [manifest, developmentManifest]) {
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

const developmentFiles = [
  developmentManifest.action?.default_popup,
  developmentManifest.background?.service_worker,
  developmentManifest.icons?.["32"],
  ...(developmentManifest.content_scripts ?? []).flatMap(
    (contentScript) => contentScript.js ?? [],
  ),
].filter((value) => typeof value === "string");

await Promise.all(developmentFiles.map((file) => access(resolve(file))));
