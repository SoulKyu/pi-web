import type { Metadata, Viewport } from "next";
import { Geist, JetBrains_Mono, Orbitron } from "next/font/google";
import { PwaRegistration } from "@/components/PwaRegistration";
import "katex/dist/katex.min.css";
import "./globals.css";
import "./settings.css";
import "./sidebar.css";
import "./sidebar-menu.css";
import "./sidebar-tron.css";
import "./agent-conversation.css";

const geist = Geist({ subsets: ["latin", "latin-ext", "cyrillic"], variable: "--font-geist", display: "swap" });
const jetbrainsMono = JetBrains_Mono({ subsets: ["latin", "latin-ext", "cyrillic"], variable: "--font-jetbrains-mono", display: "swap" });
const orbitron = Orbitron({ subsets: ["latin"], weight: ["500", "700"], variable: "--font-orbitron", display: "swap" });

export const metadata: Metadata = {
  title: "Pi Web",
  description: "Pi Web interface for the pi coding agent",
  applicationName: "Pi Web",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      {
        url: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
    ],
    apple: [
      {
        url: "/icons/apple-touch-icon.png",
        sizes: "180x180",
        type: "image/png",
      },
    ],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Pi Web",
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
  themeColor: "#000000",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" translate="no" className={`${geist.variable} ${jetbrainsMono.variable} ${orbitron.variable} dark notranslate`} suppressHydrationWarning>
      <head>
        <meta name="google" content="notranslate" />
      </head>
      <body translate="no" className="notranslate" suppressHydrationWarning>
        {children}
        <PwaRegistration />
      </body>
    </html>
  );
}
