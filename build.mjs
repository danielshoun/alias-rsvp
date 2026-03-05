import { build } from "esbuild";

await build({
  entryPoints: ["src/background.ts"],
  bundle: true,
  outfile: "dist/background.js",
  format: "iife",
  target: "firefox128",
});

await build({
  entryPoints: ["src/popup/popup.ts"],
  bundle: true,
  outfile: "dist/popup.js",
  format: "iife",
  target: "firefox128",
});

console.log("Build complete.");
