-- Rodar: psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/check.sql   (tudo em transação, rollback no fim)
begin;

-- Regra de fatura (casos reais do Organizze)
do $$ begin
  assert invoice_due('2026-10-23', 23, 5) = '2026-11-05', 'Bradesco: compra no dia do fechamento';
  assert invoice_due('2026-10-24', 23, 5) = '2026-12-05', 'Bradesco: compra após fechamento';
  assert invoice_due('2026-10-24', 27, 7) = '2026-11-07', 'Sicoob';
  assert invoice_due('2026-12-30', 29, 5) = '2027-02-05', 'virada de ano';
  assert invoice_due('2026-02-28', 30, 10) = '2026-03-10', 'fechamento 30 em fevereiro (clamp)';
  assert invoice_due('2026-10-02', 3, 10) = '2026-10-10', 'vence no mesmo mês do fechamento';
  assert invoice_due('2026-01-15', 5, 31) = '2026-02-28', 'vencimento 31 em fevereiro (clamp)';
end $$;

-- Usuário fake + fluxo completo com RLS
insert into auth.users (id, email) values ('00000000-0000-0000-0000-000000000001', 'a@test'), ('00000000-0000-0000-0000-000000000002', 'b@test');
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}';

do $$
declare acc uuid; card uuid; n int;
begin
  select count(*) into n from categories;
  assert n = 25, 'seed de categorias: ' || n;

  insert into accounts (name, initial_balance) values ('Bradesco', 100000) returning id into acc;
  insert into cards (name, limit_cents, closing_day, due_day) values ('Bradesco', 949000, 23, 5) returning id into card;

  insert into transactions (description, amount, date, account_id) values ('Salário', 229526, '2026-10-17', acc);
  insert into transactions (description, amount, date, account_id, paid) values ('IR 6/8', -24646, '2026-10-30', acc, false);
  insert into transactions (description, amount, date, card_id) values ('MERCADAO', -9616, '2026-10-23', card), ('CARREFOUR', -1615, '2026-10-24', card);

  assert (select balance from account_balances where id = acc) = 100000 + 229526, 'saldo ignora não pago';
  assert (select forecast from account_balances where id = acc) = 100000 + 229526 - 24646, 'previsto';
  assert (select total from invoices where card_id = card and invoice_date = '2026-11-05') = 9616, 'fatura nov';
  assert (select available from card_status where id = card) = 949000 - 9616 - 1615, 'limite disponível';

  -- paga fatura de novembro
  insert into transactions (description, amount, date, account_id, pays_card_id, invoice_date)
  values ('Pagamento fatura', -9616, '2026-11-05', acc, card, '2026-11-05');
  assert (select is_paid from invoices where card_id = card and invoice_date = '2026-11-05'), 'fatura paga';
  assert (select available from card_status where id = card) = 949000 - 1615, 'limite liberado';

  -- pagamento a mais vira crédito na fatura seguinte (caso real Bradesco set->out/26)
  insert into transactions (description, amount, date, card_id) values ('compra dez', -100000, '2026-11-20', card);
  insert into transactions (description, amount, date, account_id, pays_card_id, invoice_date)
  values ('pagou a mais', -50000, '2026-11-06', acc, card, '2026-11-05');
  assert (select due from invoices where card_id = card and invoice_date = '2026-12-05') = 101615 - 50000, 'crédito abate próxima fatura';
  assert (select available from card_status where id = card) = 949000 - (101615 - 50000), 'limite com crédito';
  delete from transactions where description in ('compra dez', 'pagou a mais');

  -- mudar data recalcula fatura
  update transactions set date = '2026-10-20' where description = 'CARREFOUR';
  assert (select invoice_date from transactions where description = 'CARREFOUR') = '2026-11-05', 'recalcula fatura';

  -- soma do que mexeu na conta depois de uma data (saldo de cada dia em Lançamentos): só pagos
  assert paid_sum_after(array[acc], '2026-10-31') = -9616, 'soma depois da data';
end $$;

-- RLS: usuário B não vê nada do A
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000002","role":"authenticated"}';
do $$ begin
  assert (select count(*) from transactions) = 0, 'RLS transactions';
  assert (select count(*) from account_balances) = 0, 'RLS view';
end $$;

-- Avisos (só o service_role chama): crédito de pagamento a mais cobre a fatura seguinte, sem aviso de cobrança
reset role;
do $$
declare
  u uuid := '00000000-0000-0000-0000-000000000001';
  acc uuid := (select id from accounts where user_id = u and name = 'Bradesco');
  card uuid := (select id from cards where user_id = u and name = 'Bradesco');
begin
  assert exists (select 1 from push_reminders('2026-11-05') where tag = 'fatura-' || card and body = 'R$ 16,15 a pagar'),
    'avisa fatura com saldo a pagar';
  insert into transactions (user_id, description, amount, date, account_id, pays_card_id, invoice_date)
  values (u, 'pagou a mais', -21615, '2026-11-05', acc, card, '2026-11-05');
  insert into transactions (user_id, description, amount, date, card_id) values (u, 'compra dez', -5000, '2026-11-10', card);
  assert not exists (select 1 from push_reminders('2026-12-05') where tag = 'fatura-' || card), 'crédito cobre a fatura: sem aviso';
end $$;

select 'OK' as check;
rollback;
