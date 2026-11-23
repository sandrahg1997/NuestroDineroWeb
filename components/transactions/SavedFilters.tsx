"use client";
import { Bookmark, BookmarkPlus, X } from "lucide-react";
import { MAX_SAVED_FILTERS, type SavedFilter } from "@/lib/saved-filters";

// Fila de filtros guardados: pulsar uno lo aplica; "Guardar filtro" guarda lo que hay
// puesto ahora (búsqueda + filtros). Viven en este dispositivo.
export default function SavedFilters({
  saved,
  canSave,
  onApply,
  onDelete,
  onSave,
}: {
  saved: SavedFilter[];
  canSave: boolean;
  onApply: (filter: SavedFilter) => void;
  onDelete: (filter: SavedFilter) => void;
  onSave: () => void;
}) {
  if (!saved.length && !canSave) return null;
  return (
    <div className="chip-row saved-filters" role="group" aria-label="Filtros guardados">
      {saved.map((f) => (
        <span className="chip saved-chip" key={f.id}>
          <button type="button" className="saved-chip-apply" onClick={() => onApply(f)}>
            <Bookmark size={13} aria-hidden="true" /> {f.name}
          </button>
          <button
            type="button"
            className="saved-chip-remove"
            aria-label={`Borrar el filtro ${f.name}`}
            onClick={() => onDelete(f)}
          >
            <X size={13} />
          </button>
        </span>
      ))}
      {canSave && saved.length < MAX_SAVED_FILTERS && (
        <button type="button" className="chip" onClick={onSave}>
          <BookmarkPlus size={13} aria-hidden="true" /> Guardar filtro
        </button>
      )}
    </div>
  );
}
