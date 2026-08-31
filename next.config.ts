import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["localhost", "127.0.0.1", "terminal.local", "pcs5.reply"],
  experimental: {
    serverActions: {
      allowedOrigins: [
        "localhost:5173",
        "127.0.0.1:5173",
        "terminal.local:5173",
        "pcs5.reply:5173",
      ],
    },
  },
};

export default nextConfig;
