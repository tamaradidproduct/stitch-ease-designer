import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

/**
 * GitHub Pages serves a project site from /<repo>/, so the built assets need
 * that prefix. Dev stays at the root: the launch config and every local URL
 * assume it, and hash routing means there are no path-shaped routes for the
 * difference to trip over.
 *
 * `isPreview` matters as much as `command` here. `vite preview` runs as
 * "serve", so keying only on `command === "build"` leaves preview hosting the
 * built HTML — which references /stitch-ease-designer/assets/... — at the
 * root. Every asset then misses and falls through to index.html, served as
 * text/html, and the module scripts silently refuse to execute. Preview has
 * to mirror the deployed base or it can't verify the deploy.
 */
export default defineConfig(({ command, isPreview }) => ({
  base: command === "build" || isPreview ? "/stitch-ease-designer/" : "/",
  plugins: [react()],
  server: { port: 5173 },
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
}));
