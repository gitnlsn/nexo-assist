import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Mastra and the Postgres driver are server-only Node packages: keep them out of the bundler.
  serverExternalPackages: ["@mastra/core", "postgres"],
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
