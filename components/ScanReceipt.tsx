"use client";
import { useState } from "react";
import { createWorker } from "tesseract.js";
import { createClient } from "@/lib/supabase/client";
import type { Category } from "@/lib/types";
import { merchantSuggestions, parseReceipt } from "@/lib/receipt";
import { dateKey, notifyPartnerActivity } from "@/lib/utils";
import { Camera, LoaderCircle, Save } from "lucide-react";
import { useToast } from "./Toast";
import MoneyInput from "./MoneyInput";
export default function ScanReceipt({
  householdId,
  userId,
  categories,
  rules,
}: {
  householdId: string;
  userId: string;
  categories: Category[];
  rules: { merchant_pattern: string; category_id: string }[];
}) {
  const { toast } = useToast();
  const [progress, setProgress] = useState(0);
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState("");
  const [text, setText] = useState("");
  const [merchant, setMerchant] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(dateKey());
  const [categoryId, setCategoryId] = useState("");
  const [saving, setSaving] = useState(false);
  async function scan(file: File) {
    setBusy(true);
    setProgress(0);
    setStage("Preparando el lector…");
    const url = URL.createObjectURL(file);
    let worker: Awaited<ReturnType<typeof createWorker>> | null = null;
    try {
      worker = await createWorker("spa+eng", 1, {
        logger: (m) => {
          if (m.status === "recognizing text") {
            setStage("Leyendo ticket…");
            setProgress(Math.round((m.progress ?? 0) * 100));
          } else if (m.status?.startsWith("loading")) setStage("Descargando idioma (solo la primera vez)…");
        },
      });
      const result = await worker.recognize(url);
      setText(result.data.text);
      const parsed = parseReceipt(result.data.text);
      setMerchant(parsed.merchant);
      setAmount(parsed.amount ? String(parsed.amount).replace(".", ",") : "");
      if (parsed.date) setDate(parsed.date);
      const learned = rules.find((r) => parsed.merchant.toLowerCase().includes(r.merchant_pattern));
      if (learned) setCategoryId(learned.category_id);
      else {
        const key = Object.keys(merchantSuggestions).find((k) => parsed.merchant.toLowerCase().includes(k));
        const categoryName = key ? merchantSuggestions[key] : "";
        const match = categories.find(
          (c) => c.type === "expense" && c.name.toLowerCase() === categoryName.toLowerCase()
        );
        if (match) setCategoryId(match.id);
      }
    } catch {
      toast("No se pudo leer el ticket. Prueba con otra foto o revisa la conexión.", "error");
    } finally {
      await worker?.terminate().catch(() => {});
      URL.revokeObjectURL(url);
      setBusy(false);
    }
  }
  async function save() {
    if (!amount) return toast("Revisa el importe antes de guardar.", "error");
    setSaving(true);
    const s = createClient();
    const { data: created, error } = await s
      .from("transactions")
      .insert({
        household_id: householdId,
        user_id: userId,
        concept: merchant || "Compra",
        merchant,
        amount: Number(amount.replace(",", ".")),
        date,
        category_id: categoryId || null,
        type: "expense",
        note: "Ticket escaneado",
        receipt_text: text,
      })
      .select("id")
      .single();
    if (error) {
      toast(error.message, "error");
      setSaving(false);
    } else {
      if (created) notifyPartnerActivity(created.id);
      if (merchant.trim() && categoryId)
        await s
          .from("merchant_category_rules")
          .upsert(
            { household_id: householdId, merchant_pattern: merchant.trim().toLowerCase(), category_id: categoryId },
            { onConflict: "household_id,merchant_pattern" }
          );
      location.href = "/transactions";
    }
  }
  return (
    <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))" }}>
      <div className="card">
        <label
          className="scan-drop"
          style={{ display: "block", cursor: busy ? "progress" : "pointer" }}
          aria-busy={busy}
        >
          <Camera size={42} />
          <h2>{busy ? "Leyendo el ticket…" : "Haz una foto o elige una imagen"}</h2>
          <p className="subtitle">
            Para mejores resultados: ticket plano, encuadre completo, buena luz y sin reflejos.
          </p>
          {busy && (
            <>
              <LoaderCircle className="spin" />
              {stage && <p className="subtitle">{stage}</p>}
              <div className="progress">
                <span style={{ width: `${progress}%` }} />
              </div>
            </>
          )}
          <input
            hidden
            type="file"
            accept="image/*"
            capture="environment"
            disabled={busy}
            onChange={(e) => {
              const file = e.target.files?.[0];
              // Vaciar el input permite volver a elegir la misma foto tras un fallo.
              e.target.value = "";
              if (file) scan(file);
            }}
          />
        </label>
        {text && (
          <>
            <h3>Texto reconocido</h3>
            <div className="ocr-preview">{text}</div>
          </>
        )}
      </div>
      <div className="card">
        <h2>Revisar antes de guardar</h2>
        <p className="subtitle">El OCR propone los datos, pero tú tienes la última palabra.</p>
        <div className="field">
          <label htmlFor="scanreceipt-comercio-concepto">Comercio / concepto</label>
          <input
            id="scanreceipt-comercio-concepto"
            className="input"
            value={merchant}
            onChange={(e) => setMerchant(e.target.value)}
          />
        </div>
        <div className="field" style={{ marginTop: 12 }}>
          <label htmlFor="scanreceipt-importe">Importe</label>
          <MoneyInput id="scanreceipt-importe" value={amount} onChange={setAmount} />
        </div>
        <div className="field" style={{ marginTop: 12 }}>
          <label htmlFor="scanreceipt-fecha">Fecha</label>
          <input
            id="scanreceipt-fecha"
            className="input"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
        <div className="field" style={{ marginTop: 12 }}>
          <label htmlFor="scanreceipt-categoria-sugerida">Categoría sugerida</label>
          <select
            id="scanreceipt-categoria-sugerida"
            className="select"
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
          >
            <option value="">Sin categoría</option>
            {categories
              .filter((c) => c.type === "expense")
              .map((c) => (
                <option value={c.id} key={c.id}>
                  {c.icon} {c.name}
                </option>
              ))}
          </select>
        </div>
        <button
          type="button"
          className="btn btn-primary"
          style={{ marginTop: 18, width: "100%" }}
          onClick={save}
          disabled={!text || saving}
        >
          {saving ? <LoaderCircle size={17} className="spin" /> : <Save size={17} />}
          {saving ? "Guardando…" : "Guardar gasto"}
        </button>
      </div>
    </div>
  );
}
