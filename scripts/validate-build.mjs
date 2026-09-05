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

const requiredPermissions = ["activeTab", "scripting", "storage", "sidePanel"];
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
    throw new Error("The toolbar action must open the popup.");
  }

  if (manifest.side_panel?.default_path !== "src/sidepanel/index.html") {
    throw new Error("The side panel must point to the UserNeed UI.");
  }

  const matches = manifest.content_scripts?.flatMap(
    (entry) => entry.matches ?? [],
  );
  if (
    !matches?.length ||
    matches.includes("<all_urls>") ||
    matches.some((match) => !temuHosts.includes(match))
  ) {
    throw new Error("Content scripts must be limited to supported Temu origins.");
  }
}

const expectedFiles = [
  builtManifest.action?.default_popup,
  builtManifest.side_panel?.default_path,
  builtManifest.background?.service_worker,
  builtManifest.icons?.["32"],
  ...(builtManifest.content_scripts ?? []).flatMap((entry) => entry.js ?? []),
].filter((value) => typeof value === "string");

await Promise.all(
  expectedFiles.map((file) =>
    access(resolve(outputRoot, file.replace(/^\.\//, ""))),
  ),
);

const sourceFiles = [
  sourceManifest.action?.default_popup,
  sourceManifest.side_panel?.default_path,
  sourceManifest.background?.service_worker,
  sourceManifest.icons?.["32"],
  ...(sourceManifest.content_scripts ?? []).flatMap((entry) => entry.js ?? []),
].filter((value) => typeof value === "string");

await Promise.all(sourceFiles.map((file) => accessSourceReference(file)));

if (
  builtManifest.content_scripts?.some((entry) =>
    entry.js?.some((file) => /\.(?:ts|tsx)$/.test(file)),
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

async function accessSourceReference(file) {
  const candidates = [file];

  if (file.endsWith(".js")) {
    const pathWithoutExtension = file.slice(0, -3);
    candidates.push(`${pathWithoutExtension}.ts`, `${pathWithoutExtension}.tsx`);
  }

  for (const candidate of candidates) {
    try {
      await access(resolve(extensionRoot, candidate));
      return;
    } catch {
      // Continue through the supported source extensions.
    }
  }

  throw new Error(
    `Source manifest reference was not found. Checked: ${candidates.join(", ")}`,
  );
}
