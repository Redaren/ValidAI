import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Transpile workspace packages to fix Radix UI context issues
  // See: Phase 4 Task 4 integration - Dialog, Switch, DropdownMenu rendering issues
  transpilePackages: ['@playze/shared-ui', '@playze/shared-auth', '@playze/shared-types'],
};

export default nextConfig;
