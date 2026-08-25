/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

// ---------- Identidade da versão publicada ----------
//
// Uma aba aberta guarda o código que baixou e não sabe que saiu versão nova.
// Até 25/08/2026 a única saída era pedir para a pessoa recarregar — e uma
// vendedora passou a manhã com o DIFAL zerado por causa disso.
//
// O mesmo número vai para dois lugares: embutido no código (quem está rodando)
// e num `version.json` ao lado dele (o que está publicado). Comparar os dois
// responde "saiu versão nova?" com um pedido de rede minúsculo.
//
// Na Vercel vem o commit; fora dela, a hora do build, que serve para o mesmo
// fim e nunca colide.
const ID_DO_BUILD =
  process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) ??
  process.env.GITHUB_SHA?.slice(0, 12) ??
  `local-${Date.now()}`;

function versaoPublicada(): Plugin {
  return {
    name: "versao-publicada",
    apply: "build",
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "version.json",
        source: JSON.stringify({ id: ID_DO_BUILD }),
      });
    },
  };
}

// Estrutura de pastas do projeto (ver docs/02-Arquitetura.md):
//   app/               código da aplicação (entrada: app/main.tsx)
//   components/        componentes de UI reutilizáveis
//   lib/calculations/  motor de cálculo puro — sem dependência de UI ou banco
//   tests/             testes automatizados (golden tests incluídos)
export default defineConfig({
  plugins: [react(), tailwindcss(), versaoPublicada()],
  define: {
    __VERSAO_DO_BUILD__: JSON.stringify(ID_DO_BUILD),
  },
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
