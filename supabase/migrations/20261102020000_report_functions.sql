-- Agregações no banco: a API devolve no máximo 1000 linhas, e um ano de lançamentos passa disso.
-- security invoker (padrão) => RLS do usuário vale dentro das funções.
create function report_by_month(p_from date, p_to date)
returns table (month date, income bigint, expense bigint) language sql stable as $$
  select date_trunc('month', date)::date,
         coalesce(sum(amount) filter (where amount > 0), 0)::bigint,
         coalesce(-sum(amount) filter (where amount < 0), 0)::bigint
  from report_rows where date between p_from and p_to
  group by 1 order by 1
$$;

create function report_by_category(p_from date, p_to date)
returns table (category_id uuid, income bigint, expense bigint) language sql stable as $$
  select root_category_id,
         coalesce(sum(amount) filter (where amount > 0), 0)::bigint,
         coalesce(-sum(amount) filter (where amount < 0), 0)::bigint
  from report_rows where date between p_from and p_to
  group by 1
$$;

create function report_by_day(p_from date, p_to date)
returns table (day date, expense bigint) language sql stable as $$
  select date, coalesce(-sum(amount) filter (where amount < 0), 0)::bigint
  from report_rows where date between p_from and p_to
  group by 1 order by 1
$$;
