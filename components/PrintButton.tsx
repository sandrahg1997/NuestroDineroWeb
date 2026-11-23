"use client";
import { Printer } from "lucide-react";

// Abre el diálogo de impresión del navegador: ahí se elige "Guardar como PDF"
// (en iPhone: compartir › Imprimir, o «Guardar en Archivos»).
export default function PrintButton() {
  return (
    <button type="button" className="btn btn-primary no-print" onClick={() => window.print()}>
      <Printer size={16} /> Imprimir / Guardar PDF
    </button>
  );
}
