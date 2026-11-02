-- Faturas com saldo corrido, como o Organizze: pagamento a mais vira crédito na próxima fatura,
-- pagamento a menos vira débito. running_due = quanto falta pagar no cartão até esta fatura.
-- Ex. real (Bradesco): set/26 pagou R$ 1.842,46 a mais -> out/26 (R$ 3.296,95) fica R$ 1.454,49 a pagar.
drop view card_status;
drop view invoices;

create view invoices with (security_invoker = true) as
with purchases as (
  select card_id, invoice_date, sum(amount) as total, count(*) as items
  from transactions where card_id is not null group by 1, 2
), payments as (
  select pays_card_id as card_id, invoice_date, -sum(amount) as paid
  from transactions where pays_card_id is not null group by 1, 2
), base as (
  select coalesce(p.card_id, q.card_id) as card_id,
         coalesce(p.invoice_date, q.invoice_date) as invoice_date,
         -coalesce(p.total, 0) as total,
         coalesce(q.paid, 0) as paid,
         coalesce(p.items, 0) as items
  from purchases p full join payments q on q.card_id = p.card_id and q.invoice_date = p.invoice_date
), run as (
  select *, sum(total - paid) over (partition by card_id order by invoice_date rows unbounded preceding) as running_due
  from base
)
select card_id, invoice_date, total, paid, items, running_due,
       greatest(least(total, running_due), 0) as due,   -- a pagar nesta fatura (já com crédito/débito anterior)
       running_due <= 0 as is_paid
from run;

create view card_status with (security_invoker = true) as
select c.id, c.name, c.limit_cents, c.closing_day, c.due_day, c.color, c.archived, c.last4, c.payment_account_id,
       c.limit_cents - greatest(coalesce((select sum(total - paid) from invoices i where i.card_id = c.id), 0), 0) as available,
       cur.d as current_invoice_date,
       coalesce((select due from invoices i where i.card_id = c.id and i.invoice_date = cur.d), 0) as current_invoice_due
from cards c
cross join lateral (select coalesce(
  (select min(invoice_date) from invoices i where i.card_id = c.id and i.due > 0
     and i.invoice_date >= (now() at time zone 'America/Sao_Paulo')::date),
  invoice_due((now() at time zone 'America/Sao_Paulo')::date, c.closing_day, c.due_day)) as d) cur;
