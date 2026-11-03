import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Self-contained server in .next/standalone (with only the node_modules it
  // needs) for the Docker image; see Dockerfile.
  output: "standalone",
  // Silence workspace-root detection warning when parent lockfiles exist
  turbopack: {
    root: __dirname,
  },

  // Legacy route: the dashboard moved to /vault/dashboard.
  async redirects() {
    return [{ source: "/dashboard", destination: "/vault/dashboard", permanent: true }];
  },

  // Static security headers applied on every response.
  // CSP and HSTS are set dynamically in src/proxy.ts (nonce-based per request).
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          // Clickjacking defence (belt-and-suspenders with CSP frame-ancestors)
          { key: "X-Frame-Options", value: "DENY" },
          // Prevent MIME-type sniffing
          { key: "X-Content-Type-Options", value: "nosniff" },
          // Limit referrer info to origin on cross-origin requests
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // Disable camera, mic, geolocation — none needed in a password manager
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
