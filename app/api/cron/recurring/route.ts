import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Cron diario de Vercel (ver vercel.json). Genera los movimientos recurrentes
// vencidos de todos los hogares. Vercel manda automáticamente la cabecera
// `Authorization: Bearer <CRON_SECRET>` cuando la variable CRON_SECRET existe.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("process_all_due_recurring");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, generated: data ?? 0 });
}
