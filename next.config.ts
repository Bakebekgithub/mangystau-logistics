import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // PGlite ships WASM and is only used by local tooling, never in the browser
  // bundle. Excluding it keeps the client build small and avoids WASM loaders.
  serverExternalPackages: ["@electric-sql/pglite"],
};

export default nextConfig;
