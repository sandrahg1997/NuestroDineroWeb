export type ChangelogEntry = {
  version: string;
  date: string;
  items: string[];
};

// Añade una entrada nueva arriba del todo cada vez que publiques una mejora o corrección.
// `version` debe ser único y ordenable (usamos fecha YYYY-MM-DD); `date` es el texto que se muestra.
export const changelog: ChangelogEntry[] = [
  {
    version: "2026-08-05-2",
    date: "5 de agosto de 2026",
    items: [
      "Nuevo: puedes recuperar tu contraseña desde la pantalla de inicio de sesión si la olvidas.",
      "Nuevo: en Ajustes puedes eliminar tu cuenta y tus datos personales de forma permanente.",
      "Mejora: pantallas de error más claras si algo falla o si visitas una página que no existe.",
    ],
  },
  {
    version: "2026-08-05",
    date: "5 de agosto de 2026",
    items: [
      "Corregido el presupuesto del periodo en la pantalla de inicio: ahora se calcula bien incluyendo los presupuestos por categoría (antes solo contaba el presupuesto general y por eso podía parecer que no tenías ninguno configurado).",
    ],
  },
];
