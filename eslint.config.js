import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  // supabase/functions roda em Deno (outro conjunto de globais e de imports),
  // não no navegador — não é código para esta configuração conferir.
  { ignores: ["dist", "node_modules", "supabase/functions"] },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      // Dinheiro nunca em float: proibimos o tipo number em lib/calculations
      // via revisão e testes; regras de lint específicas entram na Sprint 3.
    },
  }
);
