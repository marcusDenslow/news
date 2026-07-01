import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Self-contained server bundle for the Docker image (see web/Dockerfile).
  output: "standalone",
  // The floating dev indicator sat on top of the sidebar's add-feed button.
  devIndicators: false,
};

export default nextConfig;
