-- Grana: modelo espelhado do Organizze (API v2 + SQLite do app Android).
-- Valores em centavos (bigint). Despesa = negativo, receita = positivo.
-- Toda tabela tem user_id + RLS "só o dono".

create table accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null,
  kind text not null default 'checking' check (kind in ('checking','savings','investment','wallet','other')),
  initial_balance bigint not null default 0,
  notify_package text,            -- app Android que notifica movimentações desta conta (ex: com.nu.production)
  color text,
  archived boolean not null default false,
  ext_id text,                    -- id no Organizze (import)
  created_at timestamptz not null default now(),
  unique (user_id, ext_id)
);

create table cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null,
  limit_cents bigint not null default 0,
  closing_day int not null check (closing_day between 1 and 31),
  due_day int not null check (due_day between 1 and 31),
  payment_account_id uuid references accounts on delete set null,
  last4 text,                     -- "final 1234" nas notificações
  notify_package text,
  color text,
  archived boolean not null default false,
  ext_id text,
  created_at timestamptz not null default now(),
  unique (user_id, ext_id)
);

create table categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null,
  kind text not null check (kind in ('expense','income')),
  color text not null default '#b3b3b3',
  parent_id uuid references categories on delete cascade,
  archived boolean not null default false,
  ext_id text,
  unique (user_id, ext_id)
);

create table transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  description text not null,
  amount bigint not null,
  date date not null,
  paid boolean not null default true,
  account_id uuid references accounts on delete cascade,
  card_id uuid references cards on delete cascade,
  invoice_date date,              -- vencimento da fatura (compras no cartão e pagamentos de fatura)
  pays_card_id uuid references cards on delete cascade,  -- pagamento de fatura (lado da conta)
  category_id uuid references categories on delete set null,
  transfer_id uuid,               -- liga as duas pernas de uma transferência
  group_id uuid,                  -- série de parcelas / lançamento fixo
  installment int,
  installments int,
  recurring boolean not null default false,
  tags text[] not null default '{}',
  notes text,
  source text not null default 'manual' check (source in ('manual','notification','import','openfinance')),
  ext_id text,
  created_at timestamptz not null default now(),
  check ((account_id is null) <> (card_id is null)),
  check (pays_card_id is null or account_id is not null),
  unique (user_id, ext_id)
);
create index on transactions (user_id, date);
create index on transactions (card_id, invoice_date);
create index on transactions (user_id, lower(description));

create table budgets (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  category_id uuid not null references categories on delete cascade,
  amount bigint not null check (amount > 0),   -- limite mensal (mesmo valor todo mês)
  primary key (user_id, category_id)
);

create table devices (
  token text primary key default encode(extensions.gen_random_bytes(24), 'hex'),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null default 'Android',
  last_seen_at timestamptz,
  created_at timestamptz not null default now()
);

create table notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  package text not null,
  title text,
  body text not null,
  posted_at timestamptz not null,
  hash text not null,
  parsed jsonb,
  status text not null default 'pending' check (status in ('pending','done','ignored')),
  transaction_id uuid references transactions on delete set null,
  created_at timestamptz not null default now(),
  unique (user_id, hash)
);

-- RLS: dono vê/edita só o que é seu
do $$
declare t text;
begin
  foreach t in array array['accounts','cards','categories','transactions','budgets','devices','notifications'] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy owner on %I for all using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
  end loop;
end $$;

-- Fatura: compra até o dia de fechamento (inclusive) cai na fatura que fecha neste mês;
-- vence no due_day seguinte ao fechamento. Mesma regra observada nos dados do Organizze
-- (Bradesco fecha 23/vence 5: compra 23/10 -> 05/11, compra 24/10 -> 05/12).
create function invoice_due(p_date date, p_closing int, p_due int) returns date
language plpgsql immutable as $$
declare
  m date := date_trunc('month', p_date);
  close_m date;
  due_m date;
begin
  close_m := case when extract(day from p_date) <= least(p_closing, extract(day from m + interval '1 month - 1 day'))
                  then m else (m + interval '1 month')::date end;
  due_m := case when p_due > p_closing then close_m else (close_m + interval '1 month')::date end;
  return due_m + (least(p_due, extract(day from due_m + interval '1 month - 1 day')::int) - 1);
end $$;

create function set_invoice_date() returns trigger language plpgsql as $$
begin
  if new.card_id is null then
    if new.pays_card_id is null then new.invoice_date := null; end if;
    return new;
  end if;
  -- recalcula se não veio explícito, ou se data/cartão mudaram sem mexer na fatura
  if new.invoice_date is null or (tg_op = 'UPDATE' and new.invoice_date is not distinct from old.invoice_date
      and (new.date <> old.date or new.card_id <> old.card_id)) then
    select invoice_due(new.date, c.closing_day, c.due_day) into new.invoice_date from cards c where c.id = new.card_id;
  end if;
  return new;
end $$;

create trigger transactions_invoice before insert or update on transactions
for each row execute function set_invoice_date();

-- Views (security_invoker => RLS do usuário vale)
create view account_balances with (security_invoker = true) as
select a.id, a.name, a.kind, a.color, a.archived,
       a.initial_balance + coalesce(sum(t.amount) filter (where t.paid), 0) as balance,
       a.initial_balance + coalesce(sum(t.amount), 0) as forecast
from accounts a left join transactions t on t.account_id = a.id
group by a.id;

create view invoices with (security_invoker = true) as
with purchases as (
  select card_id, invoice_date, sum(amount) as total, count(*) as items
  from transactions where card_id is not null group by 1, 2
), payments as (
  select pays_card_id as card_id, invoice_date, -sum(amount) as paid
  from transactions where pays_card_id is not null group by 1, 2
)
select coalesce(p.card_id, q.card_id) as card_id,
       coalesce(p.invoice_date, q.invoice_date) as invoice_date,
       -coalesce(p.total, 0) as total,                -- positivo = valor a pagar
       coalesce(q.paid, 0) as paid,
       coalesce(p.items, 0) as items,
       coalesce(q.paid, 0) >= -coalesce(p.total, 0) as is_paid
from purchases p full join payments q on q.card_id = p.card_id and q.invoice_date = p.invoice_date;

-- fatura atual = próxima não paga com vencimento >= hoje (senão a que está aberta), como no Organizze
create view card_status with (security_invoker = true) as
select c.id, c.name, c.limit_cents, c.closing_day, c.due_day, c.color, c.archived, c.last4, c.payment_account_id,
       c.limit_cents - coalesce((select sum(greatest(total - paid, 0)) from invoices i where i.card_id = c.id), 0) as available,
       cur.d as current_invoice_date,
       coalesce((select total - paid from invoices i where i.card_id = c.id and i.invoice_date = cur.d), 0) as current_invoice_due
from cards c
cross join lateral (select coalesce(
  (select min(invoice_date) from invoices i where i.card_id = c.id and not i.is_paid
     and i.invoice_date >= (now() at time zone 'America/Sao_Paulo')::date),
  invoice_due((now() at time zone 'America/Sao_Paulo')::date, c.closing_day, c.due_day)) as d) cur;

-- relatórios: lançamentos que contam como receita/despesa (sem transferências e pagamentos de fatura)
create view report_rows with (security_invoker = true) as
select t.id, t.date, t.amount, t.category_id, coalesce(p.id, c.id) as root_category_id
from transactions t
left join categories c on c.id = t.category_id
left join categories p on p.id = c.parent_id
where t.transfer_id is null and t.pays_card_id is null;

-- Categorias padrão (as mesmas do Organizze) ao criar usuário
create function seed_user() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into categories (user_id, name, kind, color)
  select new.id, n, 'expense', c from (values
    ('Alimentação','#e274a8'),('Assinaturas e serviços','#c671e4'),('Bares e restaurantes','#626491'),
    ('Casa','#8193ff'),('Compras','#f67cff'),('Cuidados pessoais','#ff676d'),('Dívidas e empréstimos','#ff6c6c'),
    ('Educação','#6470ba'),('Família e filhos','#a6e88b'),('Impostos e Taxas','#ff977c'),('Investimentos','#ff70a1'),
    ('Lazer e hobbies','#b8e64c'),('Mercado','#ff8a72'),('Outros','#b3b3b3'),('Pets','#ffbe57'),
    ('Presentes e doações','#6b6fff'),('Roupas','#ff8258'),('Saúde','#72b4ff'),('Trabalho','#446ff5'),
    ('Transporte','#51bcff'),('Viagem','#ff6b6b')) v(n, c);
  insert into categories (user_id, name, kind, color)
  select new.id, n, 'income', c from (values
    ('Salário','#2ee8b3'),('Investimentos','#24b38a'),('Empréstimos','#27c498'),('Outras receitas','#2bdca9')) v(n, c);
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
for each row execute function seed_user();
