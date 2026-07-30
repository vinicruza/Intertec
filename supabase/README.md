# Supabase — Intertech Surgical CMV e Rentabilidade

- **Projeto:** Intertech Surgical CMV e Rentabilidade (`wdnontebtxnrsenvtucd`), região `sa-east-1` (São Paulo).
- **Migrations:** em `migrations/`, numeradas por data — o schema evolui só por esses arquivos, nunca por alteração manual no banco.
- Ordem: `0001 core` → `0002 catálogo` → `0003 pedidos/parâmetros` → `0004 triggers` → `0005 RLS` → `0006 seeds`.
- Modelagem explicada em `docs/03-Banco-de-Dados.md`.

## Edge Functions (`functions/`)

- **`gestao-usuarios`** — criar acesso, redefinir senha e excluir acesso pela tela de Usuários. Roda no servidor porque usa a chave de administração do projeto (`SUPABASE_SERVICE_ROLE_KEY`, injetada pelo Supabase; nunca no repositório). Antes de agir, repassa o pedido ao banco com o token de quem pediu e chama `assert_can_manage_user` — quem decide permissão é o banco, sempre.
- Publicar: `supabase functions deploy gestao-usuarios` (ou pelo painel). `verify_jwt` fica **ligado**.

## Regra que não pode ser esquecida

A política de RLS da tabela `profiles` **não pode** chamar `current_tenant_id()`, `current_user_role()` nem `has_role()`. Essas funções são `security invoker` e leem `profiles` obedecendo ao RLS: chamá-las de dentro da política de `profiles` cria um ciclo infinito, e o banco derruba a consulta com "stack depth limit exceeded" para qualquer usuário que não seja Administrador. Use só funções `security definer` (`admin_tenant_id()`, `current_user_is_super_admin()`). A migração `20260729001500` conserta esse defeito e deixa uma verificação automática que falha se ele voltar.
