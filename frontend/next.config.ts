import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: [
    "recharts",
    "react-smooth",
    "d3-interpolate",
    "d3-color",
    "d3-format",
    "d3-time",
    "d3-time-format",
    
  ],
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
