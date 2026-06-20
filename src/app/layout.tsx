import type { Metadata, Viewport } from "next";
import { AppThemeProvider } from "@/presentation/AppThemeProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: "Accessibilite SNCF",
  description: "Informations voyageurs SNCF accessibles sur mobile.",
  manifest: "/manifest.webmanifest",
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
          {children}
        </AppThemeProvider>
      </body>
    </html>
  );
}
