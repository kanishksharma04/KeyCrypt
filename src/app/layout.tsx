import type { Metadata } from "next";
import { headers } from "next/headers";
import { Inter } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/providers/theme-provider";
import { Toaster } from "@/components/ui/sonner";

// Validate required env vars at startup (throws if misconfigured)
import "@/lib/env";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "KeyCrypt",
    template: "%s | KeyCrypt",
  },
  description:
    "Zero-knowledge encrypted password manager. Your secrets never leave your device unencrypted.",
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"),
  openGraph: {
    title: "KeyCrypt",
    description:
      "Zero-knowledge encrypted password manager. Your secrets never leave your device unencrypted.",
    siteName: "KeyCrypt",
    images: [{ url: "/opengraph-image.png", width: 1200, height: 630 }],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "KeyCrypt",
    description:
      "Zero-knowledge encrypted password manager. Your secrets never leave your device unencrypted.",
    images: ["/opengraph-image.png"],
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // The nonce is injected by middleware and used by Next.js to stamp its own
  // <script> tags, satisfying the nonce-based Content-Security-Policy.
  const nonce = (await headers()).get("x-nonce") ?? "";

  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <body className="flex min-h-full flex-col antialiased">
        <ThemeProvider nonce={nonce}>
          {children}
          <Toaster richColors position="bottom-right" />
        </ThemeProvider>
      </body>
    </html>
  );
}
