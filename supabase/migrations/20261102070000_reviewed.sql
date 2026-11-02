-- Fila "Para revisar" (estilo Copilot/Monarch): lançamentos automáticos nascem não revisados.
alter table transactions add column reviewed boolean not null default true;
create index on transactions (user_id) where not reviewed;
