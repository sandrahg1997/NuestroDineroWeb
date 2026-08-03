import "./globals.css";
import type { Metadata, Viewport } from "next";
export const metadata: Metadata = { title: "OurMoney", description: "Finanzas compartidas, claras y sincronizadas", manifest: "/manifest.webmanifest", appleWebApp: { capable: true, title: "OurMoney", statusBarStyle: "default" } };
export const viewport: Viewport = { themeColor: "#9c4dcc", width: "device-width", initialScale: 1 };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="es"><body>{children}</body></html>; }
