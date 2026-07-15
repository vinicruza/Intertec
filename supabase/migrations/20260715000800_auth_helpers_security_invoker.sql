-- O perfil próprio já é legível por RLS. Portanto estes helpers não precisam
-- executar como o proprietário do banco nem contornar RLS.
alter function public.current_tenant_id() security invoker;
alter function public.current_user_role() security invoker;
