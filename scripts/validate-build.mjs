import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";

const outputRoot = resolve("dist");
const extensionRoot = resolve("extension");
const manifestPath = resolve(outputRoot, "manifest.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const sourceManifest = JSON.parse(
  await readFile(resolve(extensionRoot, "manifest.json"), "utf8"),
);

const requiredPermissions = ["activeTab", "scripting", "storage", "sidePanel"];
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
  manifest.side_panel?.default_path,
  manifest.background?.service_worker,
  manifest.icons?.["32"],
  ...(manifest.content_scripts ?? []).flatMap(
    (contentScript) => contentScript.js ?? [],
  ),
].filter((value) => typeof value === "string");

const expectedFiles = [...new Set(manifestFiles)];

await Promise.all(
  expectedFiles.map((file) => access(resolve(outputRoot, file.replace(/^\.\//, "")))),
);

const sourceFiles = [
  sourceManifest.action?.default_popup,
  sourceManifest.side_panel?.default_path,
  sourceManifest.background?.service_worker,
  sourceManifest.icons?.["32"],
  ...(sourceManifest.content_scripts ?? []).flatMap(
    (contentScript) => contentScript.js ?? [],
  ),
].filter((value) => typeof value === "string");

await Promise.all(
  sourceFiles.map((file) => accessSourceReference(file)),
);

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
