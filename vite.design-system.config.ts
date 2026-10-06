import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

/**
 * Builds the living style guide (design-system.html, src/design-system/) as
 * one self-contained page: every script, stylesheet and image is inlined so
 * the result can be committed to docs/ and published as a claude.ai
 * artifact. scripts/build-design-system.mjs runs this and post-processes it.
 */
export default defineConfig({
  base: "./",
  plugins: [react()],
  build: {
    outDir: "dist-design-system",
    emptyOutDir: true,
    assetsInlineLimit: Number.MAX_SAFE_INTEGER,
    cssCodeSplit: false,
    modulePreload: false,
    rollupOptions: {
      input: "design-system.html",
      output: { codeSplitting: false },
    },
  },
});
