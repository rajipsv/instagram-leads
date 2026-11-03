import type { Metadata, Viewport } from "next";
import { ServiceWorkerRegistration } from "@/components/pwa";
// Self-hosted fonts (bundled, so they also work offline in the installed app)
import "@fontsource/fira-sans/latin-400.css";
import "@fontsource/fira-sans/latin-500.css";
import "@fontsource/fira-sans/latin-600.css";
import "@fontsource/fira-sans/latin-700.css";
import "@fontsource/fira-code/latin-500.css";
import "@fontsource/fira-code/latin-600.css";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Growth Intelligence", template: "%s · Growth Intelligence" },
  description: "Find customers on Instagram, understand their challenges, and run campaigns that learn.",
  applicationName: "Growth Intelligence",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "GrowthIQ" },
  icons: { icon: "/icons/icon.svg", apple: "/icons/apple-touch-icon.svg" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#1e40af" },
    { media: "(prefers-color-scheme: dark)", color: "#0b1220" },
  ],
};

// Applies the saved or system theme before first paint (no flash).
const themeScript = `(function(){try{var t=localStorage.getItem('gi-theme');var d=t?t==='dark':matchMedia('(prefers-color-scheme: dark)').matches;if(d)document.documentElement.classList.add('dark')}catch(e){}})()`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-dvh font-sans text-[15px]">
        {children}
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}
