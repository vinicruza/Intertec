import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist", "node_modules"] },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      // Dinheiro nunca em float: proibimos o tipo number em lib/calculations
      // via revisão e testes; regras de lint específicas entram na Sprint 3.
    },
  }
);
