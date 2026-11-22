import type { Metadata, Viewport } from "next";
import "./globals.css";
import { SwRegister } from "@/components/SwRegister";
import { NetworkBar } from "@/components/NetworkBar";

const BASE_PATH = (process.env.NEXT_PUBLIC_BASE_PATH || "").replace(/\/$/, "");

export const metadata: Metadata = {
  title: "用药管理器",
  description: "每日进食、用药、饮水提醒与记录",
  applicationName: "用药管理器",
  appleWebApp: { capable: true, title: "用药管理器", statusBarStyle: "default" },
  formatDetection: { telephone: false, email: false, address: false },
  icons: { icon: `${BASE_PATH}/icon.svg`, apple: `${BASE_PATH}/icon.svg` },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: "#f6f7fa",
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head>

        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                var m = window.matchMedia('(prefers-reduced-motion: reduce)');
                if (m.matches) document.documentElement.dataset.reduceMotion = '1';
                if (window.matchMedia('(prefers-reduced-transparency: reduce)').matches) {
                  document.documentElement.dataset.reduceTransparency = '1';
                }
                if (window.navigator.deviceMemory && window.navigator.deviceMemory <= 2) {
                  document.documentElement.dataset.reduceTransparency = '1';
                }
              } catch (e) {}
            `,
          }}
        />
      </head>
      <body>
        <NetworkBar />
        {children}
        <SwRegister />
      </body>
    </html>
  );
}