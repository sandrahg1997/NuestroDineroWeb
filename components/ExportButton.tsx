"use client";
import { useState } from "react";
import { Download, LoaderCircle } from "lucide-react";
import type { SheetData } from "@/lib/export-xlsx";
import { useToast } from "./Toast";

// Descarga un Excel. Las hojas pueden venir ya hechas (páginas de servidor) o calcularse
// al pulsar (pantallas que editan datos y deben exportar lo que se ve ahora mismo).
export default function ExportButton({
  sheets,
  getSheets,
  fileName,
  label = "Exportar Excel",
  className = "btn btn-soft",
}: {
  sheets?: SheetData[];
  getSheets?: () => SheetData[];
  fileName: string;
  label?: string;
  className?: string;
}) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  async function run() {
    const data = getSheets ? getSheets() : (sheets ?? []);
    if (!data.length || data.every((s) => s.rows.length <= 1))
      return toast("No hay nada que exportar todavía.", "info");
    setBusy(true);
    try {
      const { downloadWorkbook } = await import("@/lib/export-xlsx");
      await downloadWorkbook(data, fileName);
      toast("Excel descargado.", "success");
    } catch (err) {
      toast((err as Error)?.message || "No se pudo exportar el Excel.", "error");
    }
    setBusy(false);
  }

  return (
    <button type="button" className={`${className} no-print`} onClick={run} disabled={busy}>
      {busy ? <LoaderCircle size={16} className="spin" /> : <Download size={16} />}
      {label}
    </button>
  );
}
