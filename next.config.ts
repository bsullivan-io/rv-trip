import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  output: "standalone",
  experimental: {
    serverActions: {
      bodySizeLimit: "20mb"
    }
  },
  outputFileTracingRoot: path.join(process.cwd())
};

export default nextConfig;
