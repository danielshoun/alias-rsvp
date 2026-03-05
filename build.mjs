import { build } from "esbuild";
import { cp, rm, mkdir } from "fs/promises";

await rm("dist", { recursive: true, force: true });
await mkdir("dist", { recursive: true });

await cp("manifest.json", "dist/manifest.json");
await cp("popup/popup.html", "dist/popup/popup.html", { recursive: true });
await mkdir("dist/options", { recursive: true });
await cp("options/options.html", "dist/options/options.html");
await mkdir("dist/experiment", { recursive: true });
await cp("experiment/schema.json", "dist/experiment/schema.json");

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
  outfile: "dist/popup/popup.js",
  format: "iife",
  target: "firefox128",
});

await build({
  entryPoints: ["src/options/options.ts"],
  bundle: true,
  outfile: "dist/options/options.js",
  format: "iife",
  target: "firefox128",
});

await build({
  entryPoints: ["src/experiment/api.ts"],
  bundle: false,
  outfile: "dist/experiment/api.js",
  target: "firefox128",
  banner: { js: '/* exported calendarReply */\n/* global ExtensionCommon, Cc, Ci, IOUtils, Services, ChromeUtils */' },
});

console.log("Build complete.");
