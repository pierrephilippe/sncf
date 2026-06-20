import type { Metadata, Viewport } from "next";
import { AppThemeProvider } from "@/presentation/AppThemeProvider";
import { PwaRegistration } from "@/presentation/PwaRegistration";
import "./globals.css";

export const metadata: Metadata = {
  title: "SNCFady",
  description: "Informations voyageurs SNCFady accessibles sur mobile.",
  manifest: "/manifest.webmanifest",
  applicationName: "SNCFady",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "SNCFady",
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#111111",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" data-theme="achromatopsia" suppressHydrationWarning>
      <body>
        <AppThemeProvider>
          <a className="skip-link" href="#contenu">
            Aller au contenu
          </a>
          <PwaRegistration />
          {children}
        </AppThemeProvider>
      </body>
    </html>
  );
}
