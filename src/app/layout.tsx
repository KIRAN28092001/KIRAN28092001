import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ToastProvider } from "@/components/ui/Toast";

export const metadata: Metadata = {
  title: { default: "Tool Connected", template: "%s · Tool Connected" },
  description: "Construction tool inventory, requests, approvals, transfers and barcode tracking.",
  applicationName: "Tool Connected",
  icons: { icon: "/icon.svg" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F5B800" },
    { media: "(prefers-color-scheme: dark)", color: "#111113" },
  ],
};

// Apply the saved theme before paint to avoid a flash.
const themeScript = `try{var t=localStorage.getItem('tc-theme');if(t==='dark'||(!t&&matchMedia('(prefers-color-scheme: dark)').matches))document.documentElement.classList.add('dark')}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning style={{ ["--font-sans" as string]: "'Inter', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" }}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
