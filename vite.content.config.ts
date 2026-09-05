import { resolve } from "node:path";
import { defineConfig } from "vite";

const repositoryRoot = import.meta.dirname;
const extensionRoot = resolve(repositoryRoot, "extension");
const outputRoot = resolve(repositoryRoot, "dist");

// Chrome executes manifest content scripts as classic scripts. Building this
// entry separately keeps it self-contained and prevents Rollup from emitting
// static imports to chunks shared with the module-based popup or service worker.
export default defineConfig({
  root: extensionRoot,
  publicDir: false,
  build: {
    outDir: outputRoot,
    emptyOutDir: false,
    rollupOptions: {
      input: resolve(extensionRoot, "src/content/index.ts"),
      output: {
        format: "iife",
        entryFileNames: "assets/content.js",
      },
    },
  },
});
