/**
 * Bundle the compiled ESM output into a single CJS file for pkg.
 * esbuild handles the ESM→CJS conversion and tree-shakes dependencies.
 */
import { build } from "esbuild";

await build({
  entryPoints: ["dist/index.js"],
  bundle: true,
  platform: "node",
  target: "node18",
  format: "cjs",
  outfile: "bundle/index.cjs",
  external: [],
  banner: {
    js: "/* steam-game-importer — bundled for pkg */",
  },
});

console.log("Bundled to bundle/index.cjs");
