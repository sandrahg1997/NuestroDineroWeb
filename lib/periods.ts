type Range = { id?: string; name: string; start_date: string; end_date: string };

// Periodos que comparten al menos un día con [start, end] (fechas "YYYY-MM-DD",
// ambos extremos incluidos). `excludeId` deja fuera el propio periodo al editarlo.
export function overlappingPeriods<T extends Range>(start: string, end: string, periods: T[], excludeId?: string) {
  if (!start || !end || end < start) return [];
  return periods.filter((p) => p.id !== excludeId && p.start_date <= end && p.end_date >= start);
}

const short = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString("es-ES", { day: "numeric", month: "short" });

export function overlapWarning(overlaps: Range[]) {
  if (!overlaps.length) return null;
  const names = overlaps
    .slice(0, 2)
    .map((p) => `«${p.name}» (${short(p.start_date)} – ${short(p.end_date)})`)
    .join(" y ");
  const rest = overlaps.length > 2 ? ` y ${overlaps.length - 2} más` : "";
  return `Se solapa con ${names}${rest}. Los movimientos de esos días contarán en los dos.`;
}
