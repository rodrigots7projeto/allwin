import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**.brapi.dev",
      },
      {
        protocol: "https",
        hostname: "**.googleapis.com",
      },
      {
        protocol: "https",
        hostname: "**.googleusercontent.com",
      },
      {
        protocol: "https",
        hostname: "bin.bnbstatic.com",
      },
      {
        protocol: "https",
        hostname: "assets.staticimg.com",
      },
    ],
  },
};

export default nextConfig;
