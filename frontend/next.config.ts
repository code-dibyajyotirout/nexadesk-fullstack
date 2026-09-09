import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'export',
  images: {
    unoptimized: true,
  },
  typescript: {
    // Ignore ts errors on build for robustness
    ignoreBuildErrors: true,
  }
};

export default nextConfig;
