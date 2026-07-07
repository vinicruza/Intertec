/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

// Estrutura de pastas do projeto (ver docs/02-Arquitetura.md):
//   app/               código da aplicação (entrada: app/main.tsx)
//   components/        componentes de UI reutilizáveis
//   lib/calculations/  motor de cálculo puro — sem dependência de UI ou banco
//   tests/             testes automatizados (golden tests incluídos)
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@app": path.resolve(import.meta.dirname, "app"),
      "@components": path.resolve(import.meta.dirname, "components"),
      "@calc": path.resolve(import.meta.dirname, "lib/calculations/index.ts"),
    },
  },
  test: {
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    environment: "node",
  },
});
