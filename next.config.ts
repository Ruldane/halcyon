import type { NextConfig } from "next";

/*
 * Halcyon is a static site: no server, no API, no database. The whole city
 * runs and persists in the visitor's browser.
 */
const nextConfig: NextConfig = {
  output: "export",
  poweredByHeader: false,
  images: { unoptimized: true },
};

export default nextConfig;
