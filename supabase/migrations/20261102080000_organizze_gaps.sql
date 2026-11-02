-- Lacunas vs Organizze: anexos, conta fora do saldo geral, categorias essenciais (regra 50/30),
-- data do cartão nos relatórios (compra × fatura), balanço diário com saldo e relatório/renomear tags.

-- Anexos (comprovantes): caminhos no Storage, bucket privado por usuário (<user_id>/<arquivo>)
alter table transactions add column attachments text[] not null default '{}';
insert into storage.buckets (id, name, public, file_size_limit) values ('anexos', 'anexos', false, 10485760)
on conflict (id) do nothing;
create policy "anexos do dono" on storage.objects for all to authenticated
  using (bucket_id = 'anexos' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'anexos' and (storage.foldername(name))[1] = auth.uid()::text);

-- Conta que não soma no saldo geral (continua no fluxo de caixa dela)
alter table accounts add column hide_from_total boolean not null default false;
create or replace view account_balances with (security_invoker = true) as
select a.id, a.name, a.kind, a.color, a.archived,
       a.initial_balance + coalesce(sum(t.amount) filter (where t.paid), 0) as balance,
       a.initial_balance + coalesce(sum(t.amount), 0) as forecast,
       a.institution, a.hide_from_total
from accounts a left join transactions t on t.account_id = a.id
group by a.id;

-- Essenciais (≤ 50% da renda) × não essenciais (≤ 30%), como o "Equilíbrio financeiro" do Organizze
alter table categories add column essential boolean not null default false;
create function default_essential() returns trigger language plpgsql as $$
begin
  if new.kind = 'expense' and new.parent_id is null and new.name in
     ('Alimentação', 'Casa', 'Mercado', 'Saúde', 'Transporte', 'Educação', 'Impostos e Taxas', 'Dívidas e empréstimos', 'Família e filhos')
  then new.essential := true; end if;
  return new;
end $$;
create trigger categories_default_essential before insert on categories for each row execute function default_essential();
update categories set essential = true where kind = 'expense' and parent_id is null and name in
  ('Alimentação', 'Casa', 'Mercado', 'Saúde', 'Transporte', 'Educação', 'Impostos e Taxas', 'Dívidas e empréstimos', 'Família e filhos');

-- report_rows ganha cartão, fatura e tags (colunas novas no fim)
create or replace view report_rows with (security_invoker = true) as
select t.id, t.date, t.amount, t.category_id, coalesce(p.id, c.id) as root_category_id,
       t.card_id, t.invoice_date, t.tags
from transactions t
left join categories c on c.id = t.category_id
left join categories p on p.id = c.parent_id
where t.transfer_id is null and t.pays_card_id is null;

-- p_by_invoice: compras no cartão contam pela data da fatura (vencimento) em vez da data da compra/parcela
drop function report_by_month(date, date);
drop function report_by_category(date, date);
drop function report_by_day(date, date);
create function report_rows_at(p_by_invoice boolean)
returns table (d date, amount bigint, root_category_id uuid, tags text[]) language sql stable as $$
  select case when p_by_invoice and card_id is not null and invoice_date is not null then invoice_date else date end,
         amount, root_category_id, tags
  from report_rows
$$;
create function report_by_month(p_from date, p_to date, p_by_invoice boolean default false)
returns table (month date, income bigint, expense bigint) language sql stable as $$
  select date_trunc('month', d)::date,
         coalesce(sum(amount) filter (where amount > 0), 0)::bigint,
         coalesce(-sum(amount) filter (where amount < 0), 0)::bigint
  from report_rows_at(p_by_invoice) where d between p_from and p_to
  group by 1 order by 1
$$;
create function report_by_category(p_from date, p_to date, p_by_invoice boolean default false)
returns table (category_id uuid, income bigint, expense bigint) language sql stable as $$
  select root_category_id,
         coalesce(sum(amount) filter (where amount > 0), 0)::bigint,
         coalesce(-sum(amount) filter (where amount < 0), 0)::bigint
  from report_rows_at(p_by_invoice) where d between p_from and p_to
  group by 1
$$;
create function report_by_day(p_from date, p_to date, p_by_invoice boolean default false)
returns table (day date, expense bigint) language sql stable as $$
  select d, coalesce(-sum(amount) filter (where amount < 0), 0)::bigint
  from report_rows_at(p_by_invoice) where d between p_from and p_to
  group by 1 order by 1
$$;
create function report_by_tag(p_from date, p_to date, p_by_invoice boolean default false)
returns table (tag text, income bigint, expense bigint, n bigint) language sql stable as $$
  select tg, coalesce(sum(amount) filter (where amount > 0), 0)::bigint,
         coalesce(-sum(amount) filter (where amount < 0), 0)::bigint, count(*)
  from report_rows_at(p_by_invoice), unnest(tags) tg where d between p_from and p_to
  group by 1 order by 3 desc, 1
$$;

-- Balanço (só contas, sem cartões): entradas/saídas por dia (sem transferências) e saldo no fim de cada dia
create function balance_by_day(p_from date, p_to date)
returns table (day date, income bigint, expense bigint, balance bigint) language sql stable as $$
  with acc as (select id, initial_balance from accounts where not archived and not hide_from_total),
  tx as (select t.date, t.amount, t.transfer_id from transactions t join acc on acc.id = t.account_id where t.paid),
  start as (select coalesce((select sum(initial_balance) from acc), 0) + coalesce((select sum(amount) from tx where date < p_from), 0) as v),
  agg as (
    select date, sum(amount) as net,
           coalesce(sum(amount) filter (where amount > 0 and transfer_id is null), 0) as inc,
           coalesce(-sum(amount) filter (where amount < 0 and transfer_id is null), 0) as exp
    from tx where date between p_from and p_to group by 1)
  select g::date, coalesce(a.inc, 0)::bigint, coalesce(a.exp, 0)::bigint,
         ((select v from start) + sum(coalesce(a.net, 0)) over (order by g))::bigint
  from generate_series(p_from, p_to, interval '1 day') g left join agg a on a.date = g::date
  order by 1
$$;

-- Renomear (ou apagar, com nome vazio) uma tag em todos os lançamentos do usuário
create function rename_tag(p_old text, p_new text) returns integer language sql as $$
  with u as (
    update transactions set tags = coalesce((
      select array_agg(distinct x order by x) from unnest(array_replace(tags, p_old, nullif(trim(p_new), ''))) x where x is not null), '{}')
    where user_id = auth.uid() and p_old = any(tags)
    returning 1)
  select count(*)::integer from u
$$;
