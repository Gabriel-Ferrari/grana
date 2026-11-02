-- Ordem manual de contas, cartões e categorias (Ajustes > setas), como no Organizze.
alter table accounts add column position integer not null default 0;
alter table cards add column position integer not null default 0;
alter table categories add column position integer not null default 0;

create or replace view account_balances with (security_invoker = true) as
select a.id, a.name, a.kind, a.color, a.archived,
       a.initial_balance + coalesce(sum(t.amount) filter (where t.paid), 0) as balance,
       a.initial_balance + coalesce(sum(t.amount), 0) as forecast,
       a.institution, a.hide_from_total, a.position
from accounts a left join transactions t on t.account_id = a.id
group by a.id;

create or replace view card_status with (security_invoker = true) as
select c.id, c.name, c.limit_cents, c.closing_day, c.due_day, c.color, c.archived, c.last4, c.payment_account_id,
       c.limit_cents - greatest(coalesce((select sum(total - paid) from invoices i where i.card_id = c.id), 0), 0) as available,
       cur.d as current_invoice_date,
       coalesce((select due from invoices i where i.card_id = c.id and i.invoice_date = cur.d), 0) as current_invoice_due,
       c.institution, c.network, c.position
from cards c
cross join lateral (select coalesce(
  (select min(invoice_date) from invoices i where i.card_id = c.id and i.due > 0
     and i.invoice_date >= (now() at time zone 'America/Sao_Paulo')::date),
  invoice_due((now() at time zone 'America/Sao_Paulo')::date, c.closing_day, c.due_day)) as d) cur;
