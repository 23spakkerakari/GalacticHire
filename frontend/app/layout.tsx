export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import localFont from "next/font/local";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { ThemeRegistry } from "./theme-registry";
import RoleSwitchProvider from "@/components/role-switch-provider";
import { Providers } from "@/components/providers";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});
const plusJakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-plus-jakarta",
  weight: ["300", "400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "GalacticHire | AI-Powered Interview Insights",
  description:
    "Smarter interviews. Faster hires. Get AI-powered insights for recruiters and instant feedback for applicants.",
  icons: {
    icon: "/favicon.ico",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="scroll-smooth">
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${plusJakarta.variable} antialiased`}
      >
        <Providers>
          <ThemeRegistry>
            <RoleSwitchProvider>{children}</RoleSwitchProvider>
          </ThemeRegistry>
        </Providers>
      </body>
    </html>
  );
}
