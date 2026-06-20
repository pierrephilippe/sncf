"use client";

import { ThemeProvider } from "next-themes";

export function AppThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider
      attribute="data-theme"
      defaultTheme="achromatopsia"
      enableSystem={false}
      storageKey="sncf-accessibilite:theme"
      themes={["achromatopsia", "classic"]}
    >
      {children}
    </ThemeProvider>
  );
}
