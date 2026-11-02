-- Open Finance via Pluggy (MeuPluggy): conexões (items) e mapa conta Pluggy -> conta/cartão do grana.
create table pluggy_items (
  id text primary key,                         -- item id do Pluggy (vem do widget Connect)
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  connector text,
  status text,
  error text,
  last_sync_at timestamptz,
  created_at timestamptz not null default now()
);

create table pluggy_accounts (
  id text primary key,                         -- account id do Pluggy
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  item_id text not null references pluggy_items on delete cascade,
  name text, type text, subtype text, number text, balance bigint,
  account_id uuid references accounts on delete set null,
  card_id uuid references cards on delete set null,
  ignored boolean not null default false,
  check (account_id is null or card_id is null)
);

alter table pluggy_items enable row level security;
alter table pluggy_accounts enable row level security;
create policy owner on pluggy_items for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy owner on pluggy_accounts for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Sincronização diária (07:00 em Brasília). A chave service_role fica no Vault (nome 'grana_service_role'),
-- criada fora do git: select vault.create_secret('<service_role>', 'grana_service_role');
create extension if not exists pg_cron;
create extension if not exists pg_net;
select cron.schedule('pluggy-sync-diario', '0 10 * * *', $$
  select net.http_post(
    url := 'https://mfsblnrygzwdefvnezas.supabase.co/functions/v1/pluggy',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization',
      'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'grana_service_role')),
    body := '{"action":"sync","all":true}'::jsonb,
    timeout_milliseconds := 120000
  );
$$);
