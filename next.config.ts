import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // Local-first dev: allow the loopback host the dev overlay connects from
  allowedDevOrigins: ["localhost", "127.0.0.1", "[::1]"],
  // E2E isolation: when the E2E suite drives the server (E2E_DIST_DIR set),
  // build into a separate directory so the operator's dev server on :3000 and
  // its on-disk .next state are never disturbed.
  ...(process.env.E2E_DIST_DIR ? { distDir: process.env.E2E_DIST_DIR } : {}),
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
