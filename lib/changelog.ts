export type ChangelogEntry = {
  version: string;
  date: string;
  items: string[];
};

// Añade una entrada nueva arriba del todo cada vez que publiques una mejora o corrección.
// `version` debe ser único y ordenable (usamos fecha YYYY-MM-DD); `date` es el texto que se muestra.
export const changelog: ChangelogEntry[] = [
  {
    version: "2026-08-05",
    date: "5 de agosto de 2026",
    items: [
      "Corregido el porcentaje de presupuesto del periodo en la pantalla de inicio: ahora solo tiene en cuenta el presupuesto general, no los presupuestos por categoría.",
    ],
  },
];
