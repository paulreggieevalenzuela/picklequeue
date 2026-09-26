import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Workspace packages (@pickle-queue/core) are transpiled automatically.
  env: {
    // Cloud sync turns on when the server has a database. Only this flag reaches the browser, never the URL.
    NEXT_PUBLIC_CLOUD_SYNC: process.env.DATABASE_URL ? "1" : "",
  },
  experimental: {
    // Detect connectivity drops; powers the offline banner via `useOffline`.
    useOffline: true,
  },
};

export default nextConfig;
