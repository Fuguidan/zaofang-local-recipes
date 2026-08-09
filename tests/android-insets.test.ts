import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const cssPath = new URL("../app/globals.css", import.meta.url);
const capacitorConfigPath = new URL("../capacitor.config.ts", import.meta.url);

test("Android header uses both browser and Capacitor native safe-area insets", async () => {
  const [css, config] = await Promise.all([readFile(cssPath, "utf8"), readFile(capacitorConfigPath, "utf8")]);
  assert.match(config, /SystemBars:\s*\{[\s\S]*?insetsHandling:\s*"css"/);
  assert.match(css, /--app-safe-top:\s*max\(env\(safe-area-inset-top,\s*0px\),\s*var\(--safe-area-inset-top,\s*0px\)\)/);
  assert.match(css, /\.mobile-header\s*\{[^}]*var\(--app-safe-top\)/);
});
