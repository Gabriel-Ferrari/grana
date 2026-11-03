# Conectar bancos via Open Finance (Pluggy / MeuPluggy) — passo a passo

O grana busca transações e saldos dos seus bancos pelo **Open Finance oficial** usando o **MeuPluggy**,
que é gratuito para uso pessoal. Atualiza 1× por dia (a notificação do celular continua sendo o tempo real).

## Uma vez por pessoa
1. **MeuPluggy** — crie conta em [meu.pluggy.ai](https://meu.pluggy.ai) e conecte cada banco
   (Nubank, Bradesco, Itaú, Caixa, Sicoob…). Cada banco pede autorização no próprio app dele.
2. **No grana**: *Ajustes → Bancos conectados → Conectar banco* → escolha **MeuPluggy** → autorize
   (uma vez por banco).
3. **Diga onde lançar**: para cada conta/cartão que aparecer, escolha a conta ou o cartão do grana
   (o app já sugere pelo nome do banco). Toque em **Sincronizar**.

## Uma vez por instalação do grana (quem hospeda)
1. Conta de desenvolvedor em [dashboard.pluggy.ai](https://dashboard.pluggy.ai) → time (uso pessoal).
   O trial de 15 dias serve para configurar; a conexão MeuPluggy continua depois.
2. Copie o **Client ID** e gere o **Client Secret** (aparece uma vez só).
3. Guarde no Supabase, nunca no código:
   ```bash
   # .env.pluggy (fora do git)
   PLUGGY_CLIENT_ID=...
   PLUGGY_CLIENT_SECRET=...
   npx supabase secrets set --env-file .env.pluggy
   npx supabase functions deploy pluggy
   ```
4. (Opcional) Sincronização diária mesmo sem abrir o app: no **SQL Editor** do Supabase rode
   `select vault.create_secret('<service_role key>', 'grana_service_role');`
   — o agendamento `pluggy-sync-diario` (07:00) já existe na migration e passa a funcionar.
   Sem isso, o app sincroniza ao abrir (no máx. 1× a cada 12 h) e pelo botão.

## Como funciona
- `supabase/functions/pluggy`: gera o token do widget (`connect-token`) e sincroniza (`sync`).
- Lançamentos chegam com `source = 'openfinance'` e `ext_id = 'pluggy:<id>'` (não duplicam em nova sincronização).
- **Sem duplicar com a notificação**: lançamento de mesmo valor com até 2 dias de diferença, na mesma
  conta/cartão, é juntado (o da notificação ganha o `ext_id`).
- Pagamento de fatura na conta vira pagamento do cartão do mesmo banco (não conta como gasto em dobro);
  "pagamento recebido" no cartão é ignorado.
- Categoria: a última usada com a mesma descrição; senão, a categoria da Pluggy traduzida.
- Compras pendentes (`PENDING`) do cartão dos últimos 45 dias entram (são a fatura aberta); quando o banco confirma com
  outro valor ou cancela, a pendente sai sozinha na próxima sincronização.
- A autorização do Open Finance vale até 12 meses; quando vencer, o status muda e basta conectar de novo.
- Cada conta do grana tem suas próprias conexões (RLS por usuário).
