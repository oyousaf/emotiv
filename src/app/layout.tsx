import type { Metadata } from "next";
import { SeasonalTheme } from "@/components/SeasonalTheme";
import { APP_HEADLINE, APP_NAME, APP_TAGLINE } from "@/lib/brand";
import { themeForDate, themeVars } from "@/lib/season";
import "./globals.css";

export const metadata: Metadata = {
  title: APP_NAME,
  description: `${APP_HEADLINE} ${APP_TAGLINE}`,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // Render this month's palette on the server so there's no colour flash.
  const theme = themeForDate();
  return (
    <html lang="en" data-season={theme.season} style={themeVars(theme) as React.CSSProperties} suppressHydrationWarning>
      <body className="min-h-dvh">
        <SeasonalTheme />
        {children}
      </body>
    </html>
  );
}
