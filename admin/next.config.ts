import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Export static assets so the admin can be hosted on Cloudflare Pages.
  output: "export",
  images: {
    unoptimized: true
  }
};

export default nextConfig;
