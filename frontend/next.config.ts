import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Static export so Pages 可直接用 out/ 發佈
  output: "export",
  images: {
    unoptimized: true
  }
};

export default nextConfig;
