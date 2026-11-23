"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { DatabaseBackup, Download, LoaderCircle, Upload } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  buildBackup,
  describePlan,
  isEmptyPlan,
  loadHouseholdRaw,
  parseBackup,
  planRestore,
  restoreBackup,
  totalSkipped,
} from "@/lib/backup";
import { dateKey } from "@/lib/utils";
import { useToast } from "./Toast";

const MAX_FILE_BYTES = 50 * 1024 * 1024;

// Ajustes › Copia de seguridad. Descarga todo el espacio en un fichero y lo restaura
// (solo añadiendo: nunca borra ni cambia lo que ya hay).
export default function BackupSettings({ householdId, userId }: { householdId: string; userId: string }) {
  const { toast, confirm } = useToast();
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<"export" | "import" | null>(null);
  const [progress, setProgress] = useState("");

  async function download() {
    setBusy("export");
    setProgress("Reuniendo los datos…");
    try {
      const raw = await loadHouseholdRaw(createClient(), householdId);
      const backup = buildBackup(raw);
      const url = URL.createObjectURL(new Blob([JSON.stringify(backup)], { type: "application/json" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = `ourmoney-copia-${dateKey()}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      toast(`Copia descargada: ${backup.transactions.length} movimientos y todo lo demás.`, "success");
    } catch (err) {
      toast((err as Error).message || "No se pudo crear la copia.", "error");
    } finally {
      setBusy(null);
      setProgress("");
    }
  }

  async function restore(file: File) {
    if (file.size > MAX_FILE_BYTES)
      return toast("El fichero es demasiado grande para ser una copia de OurMoney.", "error");
    setBusy("import");
    try {
      setProgress("Leyendo el fichero…");
      const parsed = parseBackup(await file.text());
      if (!parsed.ok) return toast(parsed.error, "error");

      setProgress("Comparando con lo que ya hay…");
      const s = createClient();
      const existing = buildBackup(await loadHouseholdRaw(s, householdId));
      const plan = planRestore(parsed.backup, existing);
      if (isEmptyPlan(plan)) return toast("Esa copia no trae nada nuevo: todo lo que contiene ya está aquí.", "info");

      const skipped = totalSkipped(plan);
      const ok = await confirm(
        `Se van a añadir: ${describePlan(plan)}.${skipped ? ` Se omiten ${skipped} elementos que ya existen.` : ""} Los movimientos quedarán a tu nombre. No se borra ni se cambia nada de lo que ya hay.`,
        { confirmLabel: "Restaurar" }
      );
      if (!ok) return;

      await restoreBackup(s, { householdId, userId }, plan, setProgress);
      toast("Copia restaurada", "success");
      router.refresh();
    } catch (err) {
      toast((err as Error).message || "No se pudo restaurar la copia.", "error");
      router.refresh();
    } finally {
      setBusy(null);
      setProgress("");
    }
  }

  return (
    <div className="card">
      <h2>
        <DatabaseBackup size={20} /> Copia de seguridad
      </h2>
      <p className="subtitle">
        Descarga todo este espacio en un fichero: movimientos, categorías, periodos, presupuestos, recurrentes, reglas
        de comercio y objetivos de ahorro. Guárdalo donde quieras (iCloud, el ordenador…). Restaurarlo solo añade lo que
        falte y nunca borra nada.
      </p>
      <div className="toolbar" style={{ marginTop: 14, justifyContent: "flex-start" }}>
        <button type="button" className="btn btn-soft" onClick={download} disabled={busy !== null}>
          {busy === "export" ? <LoaderCircle size={16} className="spin" /> : <Download size={16} />}
          Descargar copia
        </button>
        <button
          type="button"
          className="btn btn-soft"
          onClick={() => fileRef.current?.click()}
          disabled={busy !== null}
        >
          {busy === "import" ? <LoaderCircle size={16} className="spin" /> : <Upload size={16} />}
          Restaurar copia
        </button>
        <input
          ref={fileRef}
          hidden
          type="file"
          accept="application/json,.json"
          onChange={(e) => {
            const file = e.target.files?.[0];
            // Vaciar el input permite volver a elegir el mismo fichero tras un fallo.
            e.target.value = "";
            if (file) restore(file);
          }}
        />
      </div>
      {progress && (
        <p className="subtitle" role="status" style={{ marginTop: 10 }}>
          {progress}
        </p>
      )}
      <p className="subtitle" style={{ marginTop: 10, fontSize: 12 }}>
        No incluye retos, reuniones, pagos pendientes de Apple Pay ni el texto de los tickets escaneados. Esta copia
        tiene todos tus datos financieros: no la compartas.
      </p>
    </div>
  );
}
