import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@playze/shared-ui", "@playze/shared-auth", "@playze/shared-types"],
};

export default nextConfig;
