import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "Video Studio Frontend",
  description: "AI-assisted desktop video editor frontend foundation.",
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
