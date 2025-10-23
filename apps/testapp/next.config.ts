import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@playze/shared-ui", "@playze/shared-auth", "@playze/shared-types"],
};

export default nextConfig;
