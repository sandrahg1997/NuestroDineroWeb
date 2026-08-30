import type { NextConfig } from "next";

const securityHeaders = [
  // Fuerza HTTPS durante 2 años (Vercel ya sirve por HTTPS).
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  // Evita que un navegador "adivine" el tipo de un recurso.
  { key: "X-Content-Type-Options", value: "nosniff" },
  // La app no debe poder incrustarse en un iframe (anti clickjacking).
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'; upgrade-insecure-requests" },
  // No filtrar la URL completa como referrer a terceros.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Solo permitimos la cámara (escáner de tickets); el resto, denegado.
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(), browsing-topics=()" },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
