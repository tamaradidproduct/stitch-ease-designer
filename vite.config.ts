import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

/**
 * Deployed at the root of staging.designer.stitch-ease.com (see public/CNAME) rather than
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
    // Almost everything here is plain store/logic tests that don't need a
    // DOM - "node" keeps those fast. A `.test.tsx` file renders a real
    // component (e.g. StitchPicker.test.tsx, #305/#306) and opts into
    // jsdom itself via a `// @vitest-environment jsdom` docblock.
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
}));
