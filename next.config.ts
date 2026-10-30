import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Rendering never happens inside Next.js; keep the renderer out of every bundle.
  serverExternalPackages: ["@remotion/renderer", "@remotion/bundler", "mediabunny"],
};

export default nextConfig;
