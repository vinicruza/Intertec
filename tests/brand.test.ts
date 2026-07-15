import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const arquivosAtivos = [
  "index.html",
  "package.json",
  "app/index.css",
  "app/pages/LoginPage.tsx",
  "app/pages/ShellLayout.tsx",
  "app/lib/export/dre.ts",
  "app/lib/export/pedidos.ts",
  "lib/calculations/index.ts",
  "README.md",
];

describe("identidade Intertech Surgical", () => {
  it("não expõe grafias antigas nos arquivos ativos", () => {
    const ocorrencias = arquivosAtivos.flatMap((arquivo) => {
      const conteudo = readFileSync(join(process.cwd(), arquivo), "utf8");
      return /\b(?:intertec|imtertec|intertrch)\b/i.test(conteudo) ? [arquivo] : [];
    });
    expect(ocorrencias).toEqual([]);
  });

  it("usa a marca oficial no título da aplicação", () => {
    expect(readFileSync(join(process.cwd(), "index.html"), "utf8")).toContain("Intertech Surgical");
  });
});
