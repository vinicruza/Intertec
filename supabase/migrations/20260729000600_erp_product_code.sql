-- Sprint E — Código de produto para o sistema de faturamento ("Simples").
--
-- CONTEXTO E LIMITE DESTA ENTREGA
--
-- A reunião de 16/07/2026 pediu um código de produto NUMÉRICO e estruturado,
-- porque o Simples não aceita o código semântico atual (PC-0001) e porque a
-- empresa quer estratificar vendas por tipo, tecido e gramatura.
--
-- Mas a própria reunião não fechou o formato:
--   * o limite real do Simples é desconhecido — "a gente não sabe qual é a
--     limitação dele ainda";
--   * os atributos são muitos (tamanho, gramatura, estéril, compressa, tag,
--     bag, fita) e reconheceu-se que "pode ser que nem caiba no código";
--   * ficou o alerta de "não criar um monstro".
--
-- Em 29/07/2026 o cliente respondeu "vamos verificar" sobre o limite.
--
-- POR ISSO esta migração NÃO recodifica o catálogo. Ela adiciona um código de
-- ERP PARALELO, desligado por padrão e com formato configurável. O código
-- semântico continua sendo a identidade interna do produto. Quando o limite do
-- Simples for confirmado, é só ajustar os parâmetros e gerar — sem migração
-- nova e sem quebrar referência nenhuma.

-- ------------------------------------------------------------------
-- 1. Parâmetros do código de ERP
-- ------------------------------------------------------------------
create table if not exists public.erp_code_settings (
  tenant_id uuid primary key references public.tenants (id),
  -- Ligado só depois que a Intertech confirmar o formato aceito pelo Simples.
  enabled boolean not null default false,
  -- Quantos dígitos o código inteiro tem. Seis é o que foi dito na reunião,
  -- mas é palpite até a confirmação — por isso é parâmetro, não constante.
  total_digits integer not null default 6,
  -- Quantos dígitos iniciais identificam a categoria do produto.
  category_digits integer not null default 1,
  -- Nome do sistema de destino, só para a tela conversar com o usuário.
  target_system text not null default 'Simples',
  updated_at timestamptz,
  check (total_digits between 4 and 15),
  check (category_digits between 1 and 4),
  check (category_digits < total_digits)
);

alter table public.erp_code_settings enable row level security;
create policy erp_code_settings_select on public.erp_code_settings for select
  using (tenant_id = public.current_tenant_id() and public.current_user_role() is not null);
create policy erp_code_settings_write on public.erp_code_settings for all
  using (tenant_id = public.current_tenant_id() and public.current_user_role() = 'admin')
  with check (tenant_id = public.current_tenant_id() and public.current_user_role() = 'admin');
grant select, insert, update on public.erp_code_settings to authenticated;

drop trigger if exists trg_erp_code_settings_updated_at on public.erp_code_settings;
create trigger trg_erp_code_settings_updated_at before update on public.erp_code_settings
  for each row execute function public.set_updated_at();

insert into public.erp_code_settings (tenant_id) select id from public.tenants
on conflict (tenant_id) do nothing;

-- ------------------------------------------------------------------
-- 2. Prefixo numérico por categoria
-- ------------------------------------------------------------------
-- A reunião propôs: avental começa com 1, conjunto com 2, bota com 3, campo
-- de mesa com 4, campo simples com 5. Como o catálogo hoje está organizado em
-- quatro categorias, o prefixo fica nelas e a Intertech ajusta na tela.
alter table public.product_categories
  add column if not exists erp_prefix text;

alter table public.product_categories
  drop constraint if exists product_categories_erp_prefix_format;
alter table public.product_categories
  add constraint product_categories_erp_prefix_format
  check (erp_prefix is null or erp_prefix ~ '^[0-9]{1,4}$');

update public.product_categories set erp_prefix = case prefix
  when 'PC' then '1'   -- Paramentação Cirúrgica
  when 'CC' then '2'   -- Campos Cirúrgicos
  when 'AC' then '3'   -- Acessórios Cirúrgicos
  when 'KC' then '4'   -- Kits Cirúrgicos
end
where erp_prefix is null;

-- ------------------------------------------------------------------
-- 3. Código de ERP no produto e no kit — PARALELO ao código semântico
-- ------------------------------------------------------------------
alter table public.products add column if not exists erp_code text;
alter table public.kits add column if not exists erp_code text;

create unique index if not exists products_erp_code_unique
  on public.products (tenant_id, erp_code) where erp_code is not null;
create unique index if not exists kits_erp_code_unique
  on public.kits (tenant_id, erp_code) where erp_code is not null;

comment on column public.products.erp_code is
  'Código numérico para o sistema de faturamento. Paralelo ao code semântico, '
  'que continua sendo a identidade interna. Nulo enquanto o formato aceito '
  'pelo ERP não for confirmado.';

-- ------------------------------------------------------------------
-- 4. Geração sob demanda
-- ------------------------------------------------------------------
-- Deliberadamente NÃO é trigger. Gerar código de ERP é operação de catálogo
-- inteiro, e quem decide quando rodar é o Administrador — depois de confirmar
-- o formato. Rodar de novo não mexe em quem já tem código: um código que já
-- foi para o ERP não pode mudar.
create or replace function public.generate_erp_codes()
returns integer
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_tenant_id uuid := public.current_tenant_id();
  v_cfg public.erp_code_settings%rowtype;
  v_seq_digits integer;
  v_gerados integer := 0;
  v_row record;
  v_next integer;
  v_codigo text;
begin
  if v_tenant_id is null then raise exception 'Usuário sem tenant ativo'; end if;
  if public.current_user_role() <> 'admin' then
    raise exception 'Apenas o Administrador gera códigos de ERP';
  end if;

  select * into v_cfg from public.erp_code_settings where tenant_id = v_tenant_id;
  if not found or not v_cfg.enabled then
    raise exception 'Geração de código de ERP está desligada. Confirme o formato aceito pelo % antes de ligar.', coalesce(v_cfg.target_system, 'ERP');
  end if;

  v_seq_digits := v_cfg.total_digits - v_cfg.category_digits;

  for v_row in
    select p.id, c.erp_prefix
      from public.products p
      join public.product_categories c on c.id = p.category_id
     where p.tenant_id = v_tenant_id and p.erp_code is null and p.status = 'active'
     order by p.code
  loop
    if v_row.erp_prefix is null then
      raise exception 'Categoria sem prefixo numérico definido — preencha antes de gerar';
    end if;
    if length(v_row.erp_prefix) <> v_cfg.category_digits then
      raise exception 'Prefixo "%" não tem os % dígito(s) configurados para categoria',
        v_row.erp_prefix, v_cfg.category_digits;
    end if;

    perform pg_advisory_xact_lock(hashtext('erp:' || v_tenant_id::text || ':' || v_row.erp_prefix));
    -- O sequencial é extraído POR POSIÇÃO, não por regex de dígitos no fim: o
    -- código é todo numérico, então '[0-9]+$' casaria com o código inteiro e a
    -- próxima sequência sairia com o prefixo duplicado.
    select coalesce(max(substring(erp_code from v_cfg.category_digits + 1)::integer), 0) + 1
      into v_next
      from public.products
     where tenant_id = v_tenant_id
       and left(erp_code, v_cfg.category_digits) = v_row.erp_prefix
       and length(erp_code) = v_cfg.total_digits;

    if v_next >= power(10, v_seq_digits) then
      raise exception 'Sequência estourou os % dígitos disponíveis para a categoria %. Aumente total_digits.',
        v_seq_digits, v_row.erp_prefix;
    end if;

    v_codigo := v_row.erp_prefix || lpad(v_next::text, v_seq_digits, '0');
    update public.products set erp_code = v_codigo where id = v_row.id;
    v_gerados := v_gerados + 1;
  end loop;

  return v_gerados;
end $$;

revoke execute on function public.generate_erp_codes() from public, anon;
grant execute on function public.generate_erp_codes() to authenticated;

-- ------------------------------------------------------------------
-- 5. Gravação dos parâmetros (só Administrador)
-- ------------------------------------------------------------------
create or replace function public.save_erp_code_settings(
  p_enabled boolean,
  p_total_digits integer,
  p_category_digits integer,
  p_target_system text
)
returns void language plpgsql security invoker set search_path = public, pg_temp as $$
declare v_tenant_id uuid := public.current_tenant_id();
begin
  if v_tenant_id is null then raise exception 'Usuário sem tenant ativo'; end if;
  if public.current_user_role() <> 'admin' then
    raise exception 'Apenas o Administrador altera o formato do código de ERP';
  end if;

  insert into public.erp_code_settings as e
    (tenant_id, enabled, total_digits, category_digits, target_system)
  values (v_tenant_id, p_enabled, p_total_digits, p_category_digits,
          coalesce(nullif(btrim(p_target_system), ''), 'ERP'))
  on conflict (tenant_id) do update
    set enabled = excluded.enabled,
        total_digits = excluded.total_digits,
        category_digits = excluded.category_digits,
        target_system = excluded.target_system;
end $$;

revoke execute on function public.save_erp_code_settings(boolean, integer, integer, text) from public, anon;
grant execute on function public.save_erp_code_settings(boolean, integer, integer, text) to authenticated;
