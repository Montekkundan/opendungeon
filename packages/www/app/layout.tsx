import type { Metadata } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans, Press_Start_2P } from "next/font/google";

import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { cn } from "@/lib/utils";

const fontSans = IBM_Plex_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
  weight: ["400", "500", "600"],
});

const fontMono = IBM_Plex_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  weight: ["400", "500", "600"],
});

const fontRetro = Press_Start_2P({
  subsets: ["latin"],
  variable: "--font-retro",
  weight: "400",
});

export const metadata: Metadata = {
  title: "opendungeon | Terminal dungeon crawler",
  description:
    "A terminal roguelike with local saves, multiplayer hosting, replayable dungeon layouts, and GM-created worlds.",
  openGraph: {
    title: "opendungeon",
    description:
      "A terminal roguelike with local saves, co-op hosting, and GM-created worlds.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      className={cn(
        "antialiased",
        fontSans.variable,
        fontMono.variable,
        fontRetro.variable
      )}
      lang="en"
      suppressHydrationWarning
    >
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
