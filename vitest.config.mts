import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  test: {
    // Por defecto node; los tests de componentes piden jsdom con un comentario
    // `// @vitest-environment jsdom` al principio del fichero.
    environment: "node",
    include: ["test/**/*.test.ts", "test/**/*.test.tsx"],
  },
  // tsconfig tiene jsx "preserve" (lo compila Next); en los tests lo transforma
  // Oxc con el runtime automático de React.
  oxc: { jsx: { runtime: "automatic" } },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
    },
  },
});
