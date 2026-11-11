import type { MetadataRoute } from "next";

// Web app manifest (/manifest.webmanifest): makes KeyCrypt installable. The
// service worker (public/sw.js) keeps /offline available without a network.

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "KeyCrypt",
    short_name: "KeyCrypt",
    description: "Zero-knowledge password manager. Your vault is encrypted in your browser.",
    id: "/",
    start_url: "/vault",
    scope: "/",
    display: "standalone",
    background_color: "#faf8f3",
    theme_color: "#1c1a17",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    ],
  };
}
