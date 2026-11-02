-- Banco/instituição da conta ou cartão (id do catálogo no app, ex.: 'nubank'). Nulo = palpite pelo nome.
alter table accounts add column institution text;
alter table cards add column institution text;
