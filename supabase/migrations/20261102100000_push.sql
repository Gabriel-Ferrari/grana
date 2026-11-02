-- Avisos no celular (Web Push), como os lembretes do Organizze: conta a pagar/receber no dia, fatura vencendo
-- ou fechando, limite chegando perto/estourado, atrasados (segunda-feira). Um aparelho = uma inscrição.
create table push_subscriptions (
  endpoint text primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);
alter table push_subscriptions enable row level security;
create policy owner on push_subscriptions for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- R$ 1.234,56 (sem depender do locale do banco)
create function fmt_brl(c numeric) returns text language sql immutable as $$
  select case when c < 0 then '-' else '' end || 'R$ ' || translate(to_char(abs(c) / 100.0, 'FM999,999,990.00'), ',.', '.,')
$$;

-- Avisos do dia, de todos os usuários (só o cron chama, via service_role). Sem estado: cada regra só dispara no dia certo.
create function push_reminders(d date default (now() at time zone 'America/Sao_Paulo')::date)
returns table (user_id uuid, tag text, title text, body text, url text)
language sql stable security definer set search_path = public as $$
  -- contas (não cartão) que vencem hoje, pagar e receber separados
  select h.user_id,
         case when h.saida then 'pagar' else 'receber' end,
         case when h.saida then case when h.n = 1 then 'Conta a pagar hoje' else h.n || ' contas a pagar hoje' end
              else case when h.n = 1 then 'Valor a receber hoje' else h.n || ' valores a receber hoje' end end,
         fmt_brl(abs(h.total)) || ' · ' || left(h.descs, 140),
         '/lancamentos?de=' || d || '&ate=' || d
  from (select t.user_id, t.amount < 0 as saida, count(*) as n, sum(t.amount) as total,
               string_agg(trim(t.description), ', ' order by abs(t.amount) desc) as descs
        from transactions t
        where not t.paid and t.account_id is not null and t.transfer_id is null and t.date = d
        group by 1, 2) h
  union all
  -- fatura que vence hoje e não foi paga
  select c.user_id, 'fatura-' || c.id, 'Fatura ' || c.name || ' vence hoje', fmt_brl(i.total - i.paid) || ' a pagar',
         '/cartoes?c=' || c.id
  from invoices i join cards c on c.id = i.card_id
  where i.invoice_date = d and i.total - i.paid > 0 and not c.archived
  union all
  -- fatura fecha amanhã (compras depois de amanhã já vão para a próxima)
  select c.user_id, 'fecha-' || c.id, 'Fatura ' || c.name || ' fecha amanhã', 'Até agora ' || fmt_brl(i.total),
         '/cartoes?c=' || c.id
  from cards c
  join invoices i on i.card_id = c.id and i.invoice_date = invoice_due(d + 1, c.closing_day, c.due_day)
  where not c.archived and i.total > 0
    and invoice_due(d + 2, c.closing_day, c.due_day) <> invoice_due(d + 1, c.closing_day, c.due_day)
  union all
  -- limite do mês: avisa no dia em que passou de 90% e no dia em que estourou (gasto até ontem x até anteontem)
  select b.user_id, 'limite-' || b.category_id,
         case when b.s1 >= b.amount then 'Limite de ' || b.name || ' estourado' else b.name || ' chegou a 90% do limite' end,
         fmt_brl(b.s1) || ' de ' || fmt_brl(b.amount) || ' no mês', '/limites'
  from (select b.user_id, b.category_id, b.amount, c.name,
               -coalesce(sum(r.amount) filter (where r.date <= d - 1), 0) as s1,
               -coalesce(sum(r.amount) filter (where r.date <= d - 2), 0) as s0
        from budgets b
        join categories c on c.id = b.category_id
        left join report_rows r on r.root_category_id = b.category_id and r.amount < 0
             and r.date >= date_trunc('month', d - 1)::date
        group by 1, 2, 3, 4) b
  where (b.s1 >= b.amount and b.s0 < b.amount) or (b.s1 >= b.amount * 0.9 and b.s0 < b.amount * 0.9)
  union all
  -- atrasados: resumo só às segundas, para não virar spam
  select t.user_id, 'atrasados',
         count(*) || case when count(*) = 1 then ' lançamento atrasado' else ' lançamentos atrasados' end,
         fmt_brl(abs(sum(t.amount))) || ' em aberto. Toque para ver e marcar como pago.', '/'
  from transactions t
  where extract(isodow from d) = 1 and not t.paid and t.account_id is not null and t.transfer_id is null and t.date < d
  group by t.user_id
$$;
-- security definer vê todo mundo: ninguém além do service_role chama
revoke execute on function push_reminders(date) from public, anon, authenticated;

-- Todo dia 08:00 em Brasília (mesma chave do Vault da sincronização Pluggy)
select cron.schedule('avisos-diarios', '0 11 * * *', $$
  select net.http_post(
    url := 'https://mfsblnrygzwdefvnezas.supabase.co/functions/v1/remind',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization',
      'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'grana_service_role')),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
$$);
