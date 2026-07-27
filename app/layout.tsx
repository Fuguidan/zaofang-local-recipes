import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "灶房 · 本地智能菜谱",
  description: "数据留在本机的菜谱管理、每餐推荐与完整备份工具。",
  manifest: "/manifest.webmanifest",
  applicationName: "灶房",
  appleWebApp: { capable: true, title: "灶房", statusBarStyle: "default" },
  openGraph: {
    title: "灶房 · 本地智能菜谱",
    description: "数据留在本机的智能菜谱",
    type: "website",
    locale: "zh_CN",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "灶房本地智能菜谱" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "灶房 · 本地智能菜谱",
    description: "数据留在本机的智能菜谱",
    images: ["/og.png"],
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
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
