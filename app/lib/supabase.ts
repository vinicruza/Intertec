import { createClient } from "@supabase/supabase-js";

// Cliente único do Supabase para o navegador. Usa a chave pública (anon) —
// segura para o cliente; o que protege os dados é o RLS por perfil no banco.
const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error(
    "Faltam VITE_SUPABASE_URL e/ou VITE_SUPABASE_ANON_KEY. Copie .env.example para .env e preencha."
  );
}

export const supabase = createClient(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});
