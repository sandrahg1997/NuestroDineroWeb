import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  // Antes de borrar al usuario, si es dueño de algún hogar compartido con más
  // gente, se cede la propiedad para que esa otra persona no pierda su hogar.
  const { data: ownedHouseholds } = await supabase.from("households").select("id").eq("owner_id", user.id);
  for (const household of ownedHouseholds ?? []) {
    const { data: otherMember } = await supabase
      .from("household_members")
      .select("user_id")
      .eq("household_id", household.id)
      .neq("user_id", user.id)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (otherMember) {
      await supabase.from("households").update({ owner_id: otherMember.user_id }).eq("id", household.id);
    }
  }

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await supabase.auth.signOut();
  return NextResponse.json({ ok: true });
}
