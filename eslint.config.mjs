import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FlatCompat } from "@eslint/eslintrc";

const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) });

const config = [
  { ignores: [".next/**", "node_modules/**", "public/**", "next-env.d.ts"] },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    rules: {
      // Un <button> sin type dentro de un <form> lo envía; obligamos a declararlo.
      "react/button-has-type": "error",
      // El único <img> es el logo local de 192 px; next/image no aporta nada ahí.
      "@next/next/no-img-element": "off",
      // Los `any` que quedan están acotados (respuestas de terceros, Recharts); avisamos sin bloquear.
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },
  {
    // El fake de Supabase de los tests es a propósito un objeto sin tipos.
    files: ["test/**"],
    rules: { "@typescript-eslint/no-explicit-any": "off" },
  },
];

export default config;
