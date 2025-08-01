import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // async headers() {
  //   return [
  //     {
  //       source: "/(.*)",
  //       headers: [
  //         {
  //           key: "X-Frame-Options",
  //           value: "ALLOWALL",
  //         },
  //         {
  //           key: "Content-Security-Policy",
  //           value:
  //             "frame-ancestors *; script-src 'self' 'unsafe-eval' 'unsafe-inline' data: blob:;",
  //         },
  //       ],
  //     },
  //   ];
  // },
};

export default nextConfig;
