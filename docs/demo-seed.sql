-- Dados fictícios para prints/demonstração (Supabase local).
-- Uso: crie o usuário demo@grana.local e rode:
--   docker exec -i supabase_db_grana psql -U postgres < docs/demo-seed.sql
do $$
declare
  u uuid := (select id from auth.users where email = 'demo@grana.local');
  nu uuid; it uuid; cart uuid; poup uuid; cnu uuid; cit uuid;
  m date; d date; i int;
  cat jsonb;
begin
  update auth.users set raw_user_meta_data = raw_user_meta_data || '{"full_name":"Ana Souza"}' where id = u;
  delete from transactions where user_id = u; delete from budgets where user_id = u;
  delete from cards where user_id = u; delete from accounts where user_id = u;
  perform setseed(0.42);
  select jsonb_object_agg(name || ':' || kind, id) into cat from categories where user_id = u;

  insert into accounts (user_id, name, kind, initial_balance, institution, position) values
    (u, 'Nubank', 'checking', 0, 'nubank', 0) returning id into nu;
  insert into accounts (user_id, name, kind, initial_balance, institution, position) values
    (u, 'Itaú', 'checking', 150000, 'itau', 1) returning id into it;
  insert into accounts (user_id, name, kind, initial_balance, position) values
    (u, 'Carteira', 'wallet', 18000, 2) returning id into cart;
  insert into accounts (user_id, name, kind, initial_balance, institution, position) values
    (u, 'Poupança', 'savings', 850000, 'inter', 3) returning id into poup;
  insert into cards (user_id, name, limit_cents, closing_day, due_day, payment_account_id, last4, institution, network, position) values
    (u, 'Nubank', 600000, 28, 5, nu, '4821', 'nubank', 'mastercard', 0) returning id into cnu;
  insert into cards (user_id, name, limit_cents, closing_day, due_day, payment_account_id, last4, institution, network, position) values
    (u, 'Itaú Click', 350000, 20, 27, it, '0937', 'itau', 'visa', 1) returning id into cit;

  for m in select generate_series('2026-05-01'::date, '2026-11-01', '1 month')::date loop
    -- receitas e contas fixas
    insert into transactions (user_id, description, amount, date, paid, account_id, category_id, recurring) values
      (u, 'Salário', 680000, m + 4, m + 4 <= '2026-11-02', nu, (cat->>'Salário:income')::uuid, true),
      (u, 'Aluguel', -185000, m + 9, m + 9 <= '2026-11-02', nu, (cat->>'Casa:expense')::uuid, true),
      (u, 'Condomínio', -42000, m + 9, m + 9 <= '2026-11-02', it, (cat->>'Casa:expense')::uuid, true),
      (u, 'Conta de luz', -(14000 + (random() * 6000)::int), m + 14, m + 14 <= '2026-11-02', nu, (cat->>'Casa:expense')::uuid, true),
      (u, 'Internet fibra', -11990, m + 11, m + 11 <= '2026-11-02', nu, (cat->>'Assinaturas e serviços:expense')::uuid, true),
      (u, 'Plano de saúde', -38900, m + 7, m + 7 <= '2026-11-02', nu, (cat->>'Saúde:expense')::uuid, true),
      (u, 'Guardar na poupança', -50000, m + 5, m + 5 <= '2026-11-02', nu, (cat->>'Investimentos:expense')::uuid, true);
    if extract(month from m)::int % 2 = 0 then
      insert into transactions (user_id, description, amount, date, account_id, category_id) values
        (u, 'Freela design', 90000 + (random() * 60000)::int, m + 17, it, (cat->>'Outras receitas:income')::uuid);
    end if;
    -- assinaturas no cartão
    insert into transactions (user_id, description, amount, date, card_id, category_id, recurring) values
      (u, 'Spotify', -2190, m + 2, cnu, (cat->>'Assinaturas e serviços:expense')::uuid, true),
      (u, 'Netflix', -3990, m + 12, cnu, (cat->>'Assinaturas e serviços:expense')::uuid, true),
      (u, 'Academia SmartFit', -11990, m + 3, cit, (cat->>'Cuidados pessoais:expense')::uuid, true);
    -- gastos variáveis
    for i in 1..26 loop
      d := m + (random() * (extract(day from m + interval '1 month - 1 day') - 1))::int;
      continue when d > '2026-11-02';
      insert into transactions (user_id, description, amount, date, card_id, account_id, category_id)
      select u, x.descr, -(x.lo + (random() * (x.hi - x.lo))::int), d,
             case when x.card then (case when random() < .7 then cnu else cit end) end,
             case when not x.card then (case when random() < .8 then nu else cart end) end,
             (cat->>x.ck)::uuid
      from (values
        ('Pão de Açúcar', 'Mercado:expense', 9000, 42000, true),
        ('Assaí Atacadista', 'Mercado:expense', 15000, 38000, false),
        ('iFood', 'Alimentação:expense', 3500, 9000, true),
        ('Padaria Real', 'Alimentação:expense', 1200, 4500, false),
        ('Uber', 'Transporte:expense', 1500, 4800, true),
        ('Posto Shell', 'Transporte:expense', 15000, 26000, true),
        ('Outback', 'Bares e restaurantes:expense', 12000, 26000, true),
        ('Bar do Zé', 'Bares e restaurantes:expense', 4500, 13000, false),
        ('Cinemark', 'Lazer e hobbies:expense', 4000, 9000, true),
        ('Farmácia Pague Menos', 'Saúde:expense', 2500, 11000, false),
        ('Amazon', 'Compras:expense', 5000, 25000, true),
        ('Renner', 'Roupas:expense', 9000, 28000, true),
        ('Petz', 'Pets:expense', 6000, 18000, true)
      ) x(descr, ck, lo, hi, card)
      order by random() limit 1;
    end loop;
  end loop;

  -- pagamentos das faturas já vencidas
  insert into transactions (user_id, description, amount, date, account_id, pays_card_id, invoice_date, category_id)
  select u, 'Fatura ' || c.name, -sum(-t.amount), t.invoice_date, c.payment_account_id, c.id, t.invoice_date,
         (cat->>'Outros:expense')::uuid
  from transactions t join cards c on c.id = t.card_id
  where t.user_id = u and t.invoice_date < '2026-11-02'
  group by c.id, c.name, c.payment_account_id, t.invoice_date;

  -- uma conta atrasada para o aviso do Início
  update transactions set paid = false where user_id = u and description = 'Conta de luz' and date = '2026-10-15';

  insert into budgets (user_id, category_id, amount)
  select u, (cat->>k)::uuid, v from (values
    ('Mercado:expense', 120000), ('Alimentação:expense', 50000), ('Bares e restaurantes:expense', 40000),
    ('Transporte:expense', 60000), ('Lazer e hobbies:expense', 20000), ('Compras:expense', 30000),
    ('Assinaturas e serviços:expense', 20000), ('Roupas:expense', 25000)) b(k, v);
end $$;
select count(*) as lancamentos from transactions t join auth.users u on u.id = t.user_id where u.email = 'demo@grana.local';
