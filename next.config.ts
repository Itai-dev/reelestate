import type { NextConfig } from "next";

// Same-origin route to fal's file CDN, used to pull finished clips into the
// browser for export. Vercel proxies these at the edge, so clip size doesn't
// hit the 4.5 MB function limit.
const FAL_HOSTS = ["v2", "v3", "v3b", "v3c"];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // the DW22 apartment picker is a standalone page in public/dw22, made to be embedded in a frame
  async redirects() {
    return [{ source: "/dw22", destination: "/dw22/index.html", permanent: false }];
  },
  async rewrites() {
    return [
      ...FAL_HOSTS.map((h) => ({ source: `/fal-media/${h}/:path*`, destination: `https://${h}.fal.media/:path*` })),
      { source: "/fal-media/root/:path*", destination: "https://fal.media/:path*" },
      // example reels for the landing page, served from our own domain
      { source: "/clips/:file", destination: "https://d2ol7oe51mr4n9.cloudfront.net/user_2zuj9oWHVNx5pd0yLqMmtmrn8F4/:file" },
      { source: "/showcase/:file", destination: "https://d8j0ntlcm91z4.cloudfront.net/user_2zuj9oWHVNx5pd0yLqMmtmrn8F4/:file" },
    ];
  },
};

export default nextConfig;
