import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

/**
 * Deployed at the root of app.stitch-ease.com (see public/CNAME) rather than
 * at GitHub's own /<repo>/ project-page path, so the build serves from "/"
 * same as dev - no path prefix to keep in sync between them anymore.
 */
export default defineConfig(() => ({
  base: "/",
  plugins: [react()],
  server: { port: 5173, host: true },
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
}));
