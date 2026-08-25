/// <reference types="vite/client" />

// Gravado pelo Vite no momento do build (ver vite.config.ts). É o número que a
// aba em execução compara com o `version.json` publicado.
declare const __VERSAO_DO_BUILD__: string;

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
