import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { defineConfig, type Plugin } from "vite";

const repositoryRoot = import.meta.dirname;
const extensionRoot = resolve(repositoryRoot, "extension");
const outputRoot = resolve(repositoryRoot, "dist");

function copyExtensionMetadata(): Plugin {
  return {
    name: "copy-extension-metadata",
    apply: "build",
    async closeBundle() {
      await mkdir(resolve(outputRoot, "img"), { recursive: true });
      const manifest = JSON.parse(
        await readFile(resolve(extensionRoot, "manifest.json"), "utf8"),
      ) as {
        background?: { service_worker?: string };
        content_scripts?: Array<{
          matches: string[];
          js: string[];
        }>;
      };

      if (manifest.background) {
        manifest.background.service_worker = "assets/background.js";
      }

      manifest.content_scripts = [
        {
          matches: ["<all_urls>"],
          js: ["assets/content.js"],
        },
      ];

      await Promise.all([
        writeFile(
          resolve(outputRoot, "manifest.json"),
          `${JSON.stringify(manifest, null, 2)}\n`,
        ),
        copyFile(
          resolve(extensionRoot, "img/Dehype.png"),
          resolve(outputRoot, "img/Dehype.png"),
        ),
      ]);
    },
  };
}

export default defineConfig({
  root: extensionRoot,
  publicDir: false,
  plugins: [copyExtensionMetadata()],
  build: {
    outDir: outputRoot,
    emptyOutDir: true,
    rollupOptions: {
      input: {
        popup: resolve(extensionRoot, "src/popup/popup.html"),
        sidepanel: resolve(extensionRoot, "src/sidepanel/index.html"),
        background: resolve(extensionRoot, "src/background/background.js"),
        content: resolve(extensionRoot, "src/content/index.ts"),
      },
      preserveEntrySignatures: "strict",
      output: {
        entryFileNames: "assets/[name].js",
      },
    },
  },
});
