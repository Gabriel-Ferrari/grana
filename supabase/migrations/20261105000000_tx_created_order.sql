-- Ordem no dia igual ao Organizze (o último lançado aparece primeiro) depende de created_at.
-- O import gravou tudo num INSERT só: mesmo created_at para todos, e a ordem no dia virava sorteio.
-- O id do Organizze cresce com a criação: recua 1 ms por posição, do maior id para o menor,
-- sem nunca passar do created_at original (lançamentos feitos depois do import continuam mais novos).
update transactions t
set created_at = t.created_at - make_interval(secs => x.rn / 1000.0)
from (
    select id,
           row_number() over (partition by user_id, created_at order by substring(ext_id from 8)::bigint desc) - 1 as rn
    from transactions
    where ext_id ~ '^org:tx:[0-9]+$'
) x
where t.id = x.id and x.rn > 0;
