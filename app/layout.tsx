import "./globals.css";
import type { Metadata, Viewport } from "next";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";
import { ToastProvider } from "@/components/Toast";

export const metadata: Metadata = {
  title: "OurMoney",
  description: "Finanzas compartidas, claras y sincronizadas",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "OurMoney", statusBarStyle: "default" },
};
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#faf8f5" },
    { media: "(prefers-color-scheme: dark)", color: "#150d1b" },
  ],
  width: "device-width",
  initialScale: 1,
};

// Aplica el tema guardado antes de pintar, para evitar el parpadeo.
const themeScript = `try{var t=localStorage.getItem("ourmoney-theme");if(t==="dark"||t==="light")document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <ToastProvider>{children}</ToastProvider>
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
