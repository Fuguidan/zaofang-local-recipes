import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  root: "capacitor",
  publicDir: "../public",
  base: "./",
  plugins: [react()],
  build: {
    outDir: "../dist-android",
    emptyOutDir: true,
  },
});
