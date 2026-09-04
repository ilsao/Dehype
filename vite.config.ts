import { copyFile, mkdir } from "node:fs/promises";
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
      await Promise.all([
        copyFile(
          resolve(extensionRoot, "manifest.json"),
          resolve(outputRoot, "manifest.json"),
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
        popup: resolve(extensionRoot, "src/popup/index.html"),
        popupHello: resolve(extensionRoot, "src/popup/hello.html"),
        sidepanel: resolve(extensionRoot, "src/sidepanel/index.html"),
        background: resolve(extensionRoot, "src/background/serviceWorker.ts"),
        content: resolve(extensionRoot, "src/content/index.ts"),
      },
      preserveEntrySignatures: "strict",
      output: {
        entryFileNames: "assets/[name].js",
      },
    },
  },
});
