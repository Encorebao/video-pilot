import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "Video Pilot",
  description: "Open-source AI-assisted desktop video editing workspace.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
