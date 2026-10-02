"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { LoaderCircle } from "lucide-react";
import { useToast } from "./Toast";

export default function ReviewAgreements({
  householdId,
  periodId,
  initial,
}: {
  householdId: string;
  periodId: string;
  initial: string;
}) {
  const [text, setText] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const { toast } = useToast();

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const s = createClient();
    const {
      data: { user },
    } = await s.auth.getUser();
    const { error } = await s.from("period_reviews").upsert(
      {
        period_id: periodId,
        household_id: householdId,
        agreements: text.trim(),
        updated_by: user?.id ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "period_id" }
    );
    if (error) toast(error.message, "error");
    else {
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    }
    setSaving(false);
  }

  return (
    <form onSubmit={save}>
      <textarea
        className="textarea"
        rows={5}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setSaved(false);
        }}
        placeholder={
          "Ej.:\n• Presupuesto de restaurantes a 150 €\n• Probar la semana sin comida a domicilio\n• Cancelar la suscripción que no usamos"
        }
      />
      <div className="toolbar" style={{ marginTop: 12, justifyContent: "flex-start" }}>
        <button className="btn btn-primary" disabled={saving}>
          {saving && <LoaderCircle size={16} className="spin" />}
          {saving ? "Guardando…" : "Guardar acuerdos"}
        </button>
        {saved && (
          <span className="subtitle" style={{ color: "var(--income)" }}>
            Guardado ✓
          </span>
        )}
      </div>
    </form>
  );
}
