import { cp, mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";

import { build } from "esbuild";

const projectRoot = resolve(import.meta.dirname, "..");
const outputDirectory = resolve(projectRoot, "dist");

await rm(outputDirectory, { recursive: true, force: true });
await mkdir(resolve(outputDirectory, "content"), { recursive: true });
await mkdir(resolve(outputDirectory, "icons"), { recursive: true });
await mkdir(resolve(outputDirectory, "popup"), { recursive: true });

await build({
  entryPoints: {
    "audio/audio-worklet": resolve(projectRoot, "src/audio/audio-worklet.ts"),
    "content/youtube-entry": resolve(projectRoot, "src/content/youtube-entry.ts"),
    "popup/popup": resolve(projectRoot, "src/ui/popup.ts"),
  },
  outdir: outputDirectory,
  bundle: true,
  format: "iife",
  platform: "browser",
  target: "chrome120",
  sourcemap: true,
  legalComments: "none",
});

await cp(resolve(projectRoot, "manifest.json"), resolve(outputDirectory, "manifest.json"));
await cp(resolve(projectRoot, "src/ui/popup.html"), resolve(outputDirectory, "popup/popup.html"));
await cp(resolve(projectRoot, "src/ui/popup.css"), resolve(outputDirectory, "popup/popup.css"));
for (const size of [16, 32, 48, 128]) {
  await cp(
    resolve(projectRoot, `src/assets/icons/icon${size}.png`),
    resolve(outputDirectory, `icons/icon${size}.png`),
  );
}

console.log(`Built extension in ${outputDirectory}`);
