export type ChangelogEntry = {
  version: string;
  date: string;
  items: string[];
};

// Añade una entrada nueva arriba del todo cada vez que publiques una mejora o corrección.
// `version` debe ser único y ordenable (usamos fecha YYYY-MM-DD); `date` es el texto que se muestra.
export const changelog: ChangelogEntry[] = [
  {
    version: "2026-08-11",
    date: "11 de agosto de 2026",
    items: [
      "Nuevo: puedes importar movimientos desde un CSV en Ajustes, con el mismo formato que usa la exportación.",
      "Nuevo: puedes cambiar el nombre de cada uno de tus espacios en Ajustes; ahora se distinguen por su nombre en el selector del menú lateral.",
      "Nuevo: puedes eliminar un espacio que ya no uses desde la Zona de peligro en Ajustes.",
      "Nuevo: en Inicio, pulsa en Gastos, Ingresos, tu categoría más gastada o cualquier presupuesto para ir directamente a Movimientos con ese filtro ya aplicado.",
    ],
  },
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
