import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";

const outputRoot = resolve("dist");
const extensionRoot = resolve("extension");
const sourceManifest = JSON.parse(
  await readFile(resolve(extensionRoot, "manifest.json"), "utf8"),
);
const builtManifest = JSON.parse(
  await readFile(resolve(outputRoot, "manifest.json"), "utf8"),
);

const requiredPermissions = ["activeTab", "scripting", "storage"];
const forbiddenPermissions = ["sidePanel"];
const temuHosts = ["https://temu.com/*", "https://*.temu.com/*"];
const providerHosts = [
  "https://api.openai.com/*",
  "https://generativelanguage.googleapis.com/*",
  "https://api.anthropic.com/*",
];

for (const manifest of [sourceManifest, builtManifest]) {
  for (const permission of requiredPermissions) {
    if (!manifest.permissions?.includes(permission)) {
      throw new Error(`Manifest is missing the ${permission} permission.`);
    }
  }
  for (const permission of forbiddenPermissions) {
    if (manifest.permissions?.includes(permission)) {
      throw new Error(`Manifest contains unused permission ${permission}.`);
    }
  }
  for (const host of temuHosts) {
    if (!manifest.host_permissions?.includes(host)) {
      throw new Error(`Manifest is missing Temu host permission ${host}.`);
    }
  }
  for (const host of providerHosts) {
    if (!manifest.optional_host_permissions?.includes(host)) {
      throw new Error(`Provider host must be optional: ${host}.`);
    }
    if (manifest.host_permissions?.includes(host)) {
      throw new Error(`Provider host must not be required: ${host}.`);
    }
  }
  if (manifest.action?.default_popup !== "src/popup/popup.html") {
    throw new Error("The toolbar action must open the Sprint 1 popup.");
  }
  const matches = manifest.content_scripts?.flatMap((entry) => entry.matches ?? []);
  if (
    !matches?.length ||
    matches.includes("<all_urls>") ||
    matches.some((match) => !temuHosts.includes(match))
  ) {
    throw new Error("Content scripts must be limited to supported Temu origins.");
  }
}

const expectedFiles = [
  builtManifest.action.default_popup,
  builtManifest.background?.service_worker,
  builtManifest.icons?.["32"],
  ...(builtManifest.content_scripts ?? []).flatMap((entry) => entry.js ?? []),
];

await Promise.all(
  expectedFiles.map((file) => access(resolve(outputRoot, file.replace(/^\.\//, "")))),
);

const popupHtmlPath = resolve(
  outputRoot,
  builtManifest.action.default_popup.replace(/^\.\//, ""),
);
const popupHtml = await readFile(popupHtmlPath, "utf8");
if (/rel=["']modulepreload["']/i.test(popupHtml)) {
  throw new Error(
    "Built popup must not preload extension module chunks across Chrome worlds.",
  );
}

if (
  builtManifest.content_scripts.some((entry) =>
    entry.js.some((file) => /\.(?:ts|tsx)$/.test(file)),
  )
) {
  throw new Error("Built content scripts must reference compiled JavaScript.");
}

const contentScriptPath = resolve(outputRoot, "assets/content.js");
const contentScript = await readFile(contentScriptPath, "utf8");
if (
  /(^|[;}])\s*import\s*(?:[({*"'])/m.test(contentScript) ||
  /(^|[;}])\s*export\s+(?:default|const|function|class|\{)/m.test(contentScript)
) {
  throw new Error(
    "Built content script must be self-contained classic JavaScript without imports or exports.",
  );
}
