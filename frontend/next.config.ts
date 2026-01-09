import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  images: {
    unoptimized: true
  },
  output: "standalone",
  outputFileTracingRoot: path.join(__dirname, ".."),
  eslint: {
    ignoreDuringBuilds: true
  }
};

export default nextConfig;
