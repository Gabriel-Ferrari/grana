# grana

Controle financeiro pessoal no estilo Organizze, com infraestrutura **gratuita**, login Google e
lançamentos automáticos a partir das **notificações dos bancos** no Android.

```
Android (Grana Coletor) ──POST texto cru──▶ Supabase Edge Function `ingest` ──▶ Postgres (RLS)
                                               parser + conta/cartão + categoria        ▲
Angular (Cloudflare Pages) ── supabase-js + login Google ─────────────────────────────────┘
```

| Pasta | O quê |
|---|---|
| `supabase/migrations` | schema, regras de fatura, views de saldo/fatura/relatório, RLS, categorias padrão |
| `supabase/functions/ingest` | recebe notificações, parser (`parser.ts`) |
| `web/` | app Angular: visão geral, lançamentos, cartões/faturas, relatórios, limites, notificações, ajustes |
| `android/` | coletor de notificações (Kotlin, sem dependências) |
| `scripts/import-organizze.mjs` | migra seus dados do Organizze (API v2), idempotente |
| `docs/engenharia-reversa.md` | o que foi descoberto sobre o Organizze |

## Desenvolvimento local
```bash
npx supabase start -x studio,imgproxy,vector,logflare,realtime,storage-api,postgres-meta,supavisor,mailpit
npx supabase functions serve            # outro terminal
cd web && npm i && npx ng serve          # http://localhost:4200 (login dev por e-mail/senha)
```
Testes: `node --test supabase/functions/ingest/parser.test.ts` e
`docker exec -i supabase_db_grana psql -U postgres -v ON_ERROR_STOP=1 < supabase/tests/check.sql`.

Usuário dev local: crie com
`curl -X POST http://127.0.0.1:54321/auth/v1/admin/users -H "apikey: $SERVICE_ROLE" -H "Authorization: Bearer $SERVICE_ROLE" -H 'content-type: application/json' -d '{"email":"dev@grana.local","password":"devdev123","email_confirm":true}'`
(`SERVICE_ROLE` = `npx supabase status -o env | grep SERVICE_ROLE_KEY`).

Celular contra o Supabase local: `adb reverse tcp:54321 tcp:54321` e endpoint `http://127.0.0.1:54321/functions/v1/ingest`.

## Deploy (tudo grátis)

### 1. Supabase
1. Crie um projeto em supabase.com (região São Paulo).
2. `npx supabase login && npx supabase link --project-ref SEU_REF`
3. `npx supabase db push` e `npx supabase functions deploy ingest --no-verify-jwt`

### 2. Login com Google
1. console.cloud.google.com → APIs e serviços → Tela de consentimento OAuth: Externo; adicione seu Gmail como usuário de teste
   (escopos básicos email/perfil não precisam de verificação).
2. Credenciais → Criar ID do cliente OAuth → Aplicativo da Web. URI de redirecionamento autorizado:
   `https://SEU_REF.supabase.co/auth/v1/callback`
3. Supabase → Authentication → Sign In / Providers → Google: cole Client ID e Secret.
4. Supabase → Authentication → URL Configuration: Site URL = URL do Cloudflare Pages (passo 3).
5. **Depois do seu primeiro login**, desligue "Allow new users to sign up" (Authentication → Sign In / Providers).
   Assim só você entra; o RLS já isola os dados por usuário de qualquer forma.

### 3. Frontend (Cloudflare Pages)
1. Preencha `web/src/env.prod.ts` (Project URL + publishable key — são públicas, RLS protege os dados).
2. `cd web && npx ng build && npx wrangler pages deploy dist/web/browser --project-name grana`
   (Pages sem `404.html` já serve o `index.html` para as rotas do SPA.)

### 4. Celular
1. `cd android && ./gradlew assembleDebug && adb install -r build/outputs/apk/debug/grana-coletor-debug.apk`
2. No app web: **Notificações → Gerar token**. No coletor: cole o endpoint
   `https://SEU_REF.supabase.co/functions/v1/ingest` e o token, Salvar, **Enviar teste**.
   (Por segurança, configurar via `adb am start --es …` só funciona com o app sem token; para trocar: pela tela ou `adb shell pm clear dev.grana.coletor`.)
3. Samsung: *Configurações → Notificações → Configurações avançadas → Acesso às notificações do dispositivo* → ative **Grana Coletor**.
   *Aplicativos → Grana Coletor → Bateria → Não restringir*; em *Bateria → Limites de uso em segundo plano* coloque em
   **"Aplicativos que nunca entram em suspensão"**.
4. Em **Ajustes** do app web, preencha em cada conta/cartão o **app que notifica** e o **final do cartão**.
   Com isso as notificações viram lançamentos automáticos; o que não casar fica em **Notificações** para revisar.
   Quando um banco mandar um formato que o parser não entende, copie o texto para `parser.test.ts` e ajuste `parser.ts`.

### 5. Migrar do Organizze
Token em app.organizze.com.br/configuracoes/api-keys, depois:
```bash
ORGANIZZE_EMAIL=... ORGANIZZE_TOKEN=... SUPABASE_URL=https://SEU_REF.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=... GRANA_EMAIL=seu@gmail.com node scripts/import-organizze.mjs 2018-01
```

## Cuidados do plano grátis
- Supabase pausa o projeto após **7 dias sem atividade** — o coletor enviando notificações mantém ativo.
- Plano grátis não tem backup automático: rode `npx supabase db dump --data-only > backup.sql` de vez em quando.
- Relatórios buscam linhas cruas (limite padrão de 1000 por consulta no Supabase) — se um período tiver mais que isso,
  troque por uma função SQL agregada.

## Opções de banco gratuito avaliadas
| Opção | Grátis | Prós | Contras |
|---|---|---|---|
| **Supabase** (escolhido) | Postgres 500 MB, Auth, 500 mil funções/mês | Login Google, RLS e API REST prontos: zero backend de CRUD | pausa após 7 dias parado; sem backup no free |
| Cloudflare D1 + Workers | 5 GB, 5 mi leituras/dia | nunca pausa, você já usa wrangler | SQLite; login Google e API CRUD escritos à mão |
| Neon | Postgres 0,5 GB | scale-to-zero, branches | só banco (sem auth/API) |
| Turso | SQLite ~5 GB | rápido na edge | só banco |
| Firebase | Firestore 1 GB + Auth | login Google trivial | NoSQL ruim p/ relatórios; Functions exigem plano Blaze (cartão) |
| MongoDB Atlas M0 | 512 MB | — | só banco, NoSQL |

## Conexão direta com bancos (Bradesco, Sicoob, Caixa, Nubank)
- **Direto com o banco: inviável.** Open Finance Brasil só libera dados para instituições autorizadas pelo Banco Central;
  pessoa física não se cadastra. APIs internas dos apps exigem vínculo de aparelho/token/2FA, violam os termos e quebram
  sem aviso (a lib não oficial do Nubank, pynubank, parou de funcionar).
- **Via agregador: viável e grátis para uso pessoal** com **Meu Pluggy** (meu.pluggy.ai): você conecta seus bancos por
  Open Finance (os 4 participam), cria uma aplicação de desenvolvimento no dashboard da Pluggy (o trial de 15 dias é só
  para configurar; os dados continuam vindo depois) e puxa as transações pela API com client_id/secret. Atualiza 1×/dia;
  consentimento dura até 12 meses. O Organizze faz o mesmo com a Belvo (paga).
- Implementação sugerida (não feita ainda): Edge Function agendada (pg_cron) que busca `/transactions` da Pluggy e faz
  upsert com `ext_id = 'pluggy:<id>'` e `source = 'openfinance'`, conciliando com os lançamentos vindos de notificação
  (mesmo valor ± 1 dia na mesma conta). Notificação = tempo real; Open Finance = conferência diária.
