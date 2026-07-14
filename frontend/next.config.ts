import type { NextConfig } from "next";

const RAILWAY_API = "https://allwin-backend-production.up.railway.app/api/v1";

const nextConfig: NextConfig = {
  output: "export",
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || RAILWAY_API,
  },
  images: {
    unoptimized: true,
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
