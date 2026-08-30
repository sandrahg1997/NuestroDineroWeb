import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Recibe los errores de cliente que capturan app/error.tsx y app/global-error.tsx
// y los deja en los logs del servidor (Vercel > Deployment > Logs). Es una red de
// seguridad mínima: para alertas, agrupación y stack traces con source maps,
// conecta Sentry (@sentry/nextjs) — ver README.
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    console.error("[client-error]", JSON.stringify(body).slice(0, 4000));
  } catch {
    // cuerpo inválido: nada que registrar
  }
  return NextResponse.json({ ok: true });
}
