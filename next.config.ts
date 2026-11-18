import type { NextConfig } from "next";

// Same-origin route to fal's file CDN, used to pull finished clips into the
// browser for export. Vercel proxies these at the edge, so clip size doesn't
// hit the 4.5 MB function limit.
const FAL_HOSTS = ["v2", "v3", "v3b", "v3c"];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [
      ...FAL_HOSTS.map((h) => ({ source: `/fal-media/${h}/:path*`, destination: `https://${h}.fal.media/:path*` })),
      { source: "/fal-media/root/:path*", destination: "https://fal.media/:path*" },
    ];
  },
};

export default nextConfig;
