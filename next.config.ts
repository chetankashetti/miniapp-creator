import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Exclude generated directories from build
  webpack: (config) => {
    config.watchOptions = {
      ...config.watchOptions,
      ignored: ['**/generated/**', '**/node_modules/**'],
    };
    return config;
  },
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
